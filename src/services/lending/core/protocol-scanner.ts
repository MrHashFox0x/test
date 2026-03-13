import dotenv from "dotenv";
import { Keyring } from "@polkadot/api";
import { connectToArchiveNode } from "../utils/provider";
import {
  readNewRemarks,
  validateUserRemark,
  type ParsedRemark
} from "../utils/remark-reader";
import { getLatestStateOfMarketRemark } from "../utils/remark-reader";
import { writeStateOfMarketRemark } from "../utils/remark-writer";
import { verifyTransaction } from "../utils/transaction-verifier";
import type { UserRemark, StateOfMarketRemark, ActionInProgress } from "../types";
import { UserActionType, ProtocolActionType } from "../types";
import { DepositAction } from "../actions/deposit";
import { WithdrawAction } from "../actions/withdraw";
import { BorrowAction } from "../actions/borrow";
import { RepayAction } from "../actions/repay";
import { DepositCollateralAction, WithdrawCollateralAction } from "../actions/collateral";
import { MarketStateManager } from "../state/market-state";
import { PositionStateManager } from "../state/position-state";
import { InterestCalculations } from "./interest-calculations";
import { transferAlphaFromProtocol, removeStake } from "../modules/call/stakeTransfer";
import { stakeOnRootAfterLiquidation } from "./root-staking";
import { TWAPUtils, getAlphaTWAPPrice } from "../modules/call/subnetData";
import { HealthCalculations } from "./health-calculations";
import { LiquidationCalculations } from "./liquidation-calculations";
import { SharesCalculations } from "./shares-calculations";
import {
  loadStateBackup,
  saveStateBackup,
  clearStateBackup,
  restoreStateFromBackup,
  getStartupMode,
  printStartupHelp
} from "./state-persistence";
import { DEFAULT_MARKET_ID, LIQUIDATION_SLIPPAGE_TOLERANCE } from "../config";
import Decimal from "decimal.js";

dotenv.config();

const PROTOCOL_MNEMONIC = process.env.CK_Test_Protocol_Lending_MNEMONIC || "";
const MENTAT_HOTKEY = process.env.HK_Mentat || "";
const SCAN_INTERVAL_MS = 12000; // 12 seconds (1 block)
const MARKET_ID = DEFAULT_MARKET_ID; // Imported from config

if (!PROTOCOL_MNEMONIC) {
  console.error("❌ Error: CK_Test_Protocol_Lending_MNEMONIC not found in .env");
  process.exit(1);
}

if (!MENTAT_HOTKEY) {
  console.error("❌ Error: HK_Mentat not found in .env");
  process.exit(1);
}

/**
 * PROTOCOL SCANNER
 *
 * This script implements the core protocol loop described in remark.md:
 *
 * 1. Protocol continuously scans blockchain for new user remarks
 * 2. When user remark detected, protocol validates and determines required action
 * 3. Case A (deposit/repay/deposit_collateral): Protocol verifies user's transaction, updates state, writes STATE_OF_MARKET
 * 4. Case B (withdraw/borrow/withdraw_collateral): Protocol writes STATE_OF_MARKET with actions_in_progress, executes transaction
 * 5. Protocol rescans from last processed user remark block and repeats cycle
 */

interface ProtocolState {
  lastProcessedBlock: number;
  currentStateNumber: number;
  isProcessing: boolean;
  processedTxHashes: Set<string>; // Track processed transaction hashes to handle multiple remarks in same block
  lastCheckedStateNumber: number; // For action monitoring
  retryCount: Map<string, number>; // For action retry tracking
  scannerStartBlock: number; // Block where scanner started - don't check actions before this
  twapSamplingInterval?: NodeJS.Timeout; // TWAP background sampling interval
}

let protocolState: ProtocolState = {
  lastProcessedBlock: 0,
  currentStateNumber: 0,
  isProcessing: false,
  processedTxHashes: new Set<string>(),
  lastCheckedStateNumber: 0,
  retryCount: new Map(),
  scannerStartBlock: 0
};

/**
 * Main protocol loop - continuously scans for USER remarks
 */
async function runProtocolLoop() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   PROTOCOL SCANNER STARTING                        ║');
  console.log('║   Scanning for USER remarks...                     ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  // Print startup help
  printStartupHelp();

  const api = await connectToArchiveNode();
  const archiveApi = await connectToArchiveNode(); // Separate connection for TWAP

  try {
    // Initialize protocol state (with optional restore from backup)
    await initializeProtocolState(api);

    // Save the block where scanner started - action monitor won't check before this
    protocolState.scannerStartBlock = protocolState.lastProcessedBlock;

    // Initialize action monitor state to current state number
    // This prevents processing old stale actions from before restart
    protocolState.lastCheckedStateNumber = protocolState.currentStateNumber;

    console.log(`✓ Protocol initialized`);
    console.log(`  Last processed block: ${protocolState.lastProcessedBlock}`);
    console.log(`  Current state number: ${protocolState.currentStateNumber}`);
    console.log(`  Action monitor will only check remarks from block ${protocolState.scannerStartBlock} onwards\n`);

    // Initialize TWAP price system
    console.log(`⟳ Initializing TWAP price system...`);

    // Clear any stale TWAP data from previous runs
    TWAPUtils.clearPriceData();
    console.log(`✓ Cleared stale TWAP data`);

    await TWAPUtils.populateHistoricalTWAP(archiveApi);
    console.log(`✓ TWAP historical data populated`);

    // Display loaded TWAP prices for verification
    console.log(`\n TWAP Price Summary:`);
    const marketSubnetId = parseInt(MARKET_ID);
    const priceStats = TWAPUtils.getPriceStats(marketSubnetId, 3600); // 1 hour window
    if (priceStats) {
      console.log(`  Market ${MARKET_ID} (Subnet ${marketSubnetId}):`);
      console.log(`    TWAP Price: ${priceStats.twapPrice.toFixed(6)} TAO`);
      console.log(`    Latest Price: ${priceStats.latestPrice.toFixed(6)} TAO`);
      console.log(`    Min Price: ${priceStats.minPrice.toFixed(6)} TAO`);
      console.log(`    Max Price: ${priceStats.maxPrice.toFixed(6)} TAO`);
      console.log(`    Samples: ${priceStats.sampleCount}`);
    } else {
      console.log(`    No TWAP data available for market ${MARKET_ID}`);
    }

    // Start automatic price sampling (every 60 seconds by default)
    protocolState.twapSamplingInterval = TWAPUtils.startPriceSampling();
    console.log(`\n✓ TWAP automatic sampling started\n`);

    // Main loop
    while (true) {
      try {
        // Priority 1: Scan and process USER remarks
        await scanAndProcessRemarks(api, archiveApi);

        // Priority 2: Check for actions in progress and execute protocol transactions
        await checkActionsInProgress(api);

        // Priority 3: Check for liquidatable positions (only if no user remarks pending)
        const hasPendingRemarks = await hasUnprocessedUserRemarks(api);
        if (!hasPendingRemarks) {
          await checkLiquidatablePositions(api, archiveApi);
        }
      } catch (error) {
        console.error(`\n❌ Error in scan cycle:`, error);
        console.log(`⟳ Continuing to next cycle...\n`);
      }

      // Wait before next scan
      await sleep(SCAN_INTERVAL_MS);
    }

  } catch (error) {
    console.error('\n❌ Fatal error in protocol loop:', error);
  } finally {
    // Cleanup TWAP sampling
    if (protocolState.twapSamplingInterval) {
      TWAPUtils.stopPriceSampling(protocolState.twapSamplingInterval);
      console.log(`✓ TWAP sampling stopped`);
    }

    await api.disconnect();
    await archiveApi.disconnect();
  }
}

/**
 * Initialize protocol state from blockchain
 */
async function initializeProtocolState(api: any) {
  const startupMode = getStartupMode();

  console.log(`⟳ Initializing protocol state (${startupMode.toUpperCase()} mode)...\n`);

  if (startupMode === 'restore') {
    // RESTORE MODE - Continue from last state
    console.log(` RESTORE MODE - Loading previous state...\n`);

    // Try backup first (faster than blockchain)
    const backup = loadStateBackup();

    if (backup) {
      // Restore state managers from backup
      restoreStateFromBackup(backup, MarketStateManager, PositionStateManager);

      // Continue from backup position
      protocolState.currentStateNumber = backup.stateNumber;
      protocolState.lastProcessedBlock = backup.blockNumber;

      console.log(`✓ Restored from disk backup`);
      console.log(`  Continuing from block: ${protocolState.lastProcessedBlock}`);
      console.log(`  State number: ${protocolState.currentStateNumber}`);
      console.log(`  Markets: ${Object.keys(backup.marketStates).length}`);
      console.log(`  Users: ${Object.keys(backup.userPositions).length}\n`);
      return;
    } else {
      console.log(`  No backup found - will start fresh from current block\n`);
    }
  }

  // FRESH MODE (default) - Start from 0
  console.log(` FRESH MODE - Starting from scratch`);
  console.log(`   All previous state will be ignored\n`);

  // Clear any existing backup
  clearStateBackup();

  // Clear state managers (ensure empty start)
  MarketStateManager.clearAllMarkets();
  PositionStateManager.clearAllPositions();

  // Get current block - start from here
  const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

  // Start fresh from 0
  protocolState.currentStateNumber = 0;
  protocolState.lastProcessedBlock = currentBlock;
  protocolState.processedTxHashes.clear();

  console.log(`  Starting from current block: ${protocolState.lastProcessedBlock}`);
  console.log(`  Initial state number: 0`);
  console.log(`  Empty state (0 supply, 0 borrows)`);
  console.log(`  Will process NEW remarks only\n`);
}

/**
 * Scan blockchain for new remarks and process them
 *
 * Following remark.md specification:
 * "Protocol rescans from last processed user remark block and repeats cycle"
 *
 * This ensures no remarks are missed even if they arrive during processing.
 */
async function scanAndProcessRemarks(api: any, archiveApi: any) {
  if (protocolState.isProcessing) {
    console.log('⏭  Skipping scan - previous scan still processing');
    return;
  }

  protocolState.isProcessing = true;

  try {
    // Get current block
    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

    // Check if there are new blocks
    if (currentBlock <= protocolState.lastProcessedBlock) {
      return; // No new blocks
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(` SCANNING blocks ${protocolState.lastProcessedBlock + 1} to ${currentBlock}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    // Read new remarks since last processed block
    const { userRemarks, stateRemarks } = await readNewRemarks(api, protocolState.lastProcessedBlock);

    console.log(`\n Found ${userRemarks.length} USER remarks, ${stateRemarks.length} STATE remarks`);

    // Build unique key for each remark (txHash:index) to handle multiple remarks per tx
    const getRemarkKey = (remark: ParsedRemark, index: number) => {
      const action = (remark.remark as any).action || 'unknown';
      return `${remark.txHash}:${action}:${index}`;
    };

    // Filter out already processed remarks
    const unprocessedRemarks = userRemarks.filter(
      (remark, index) => !protocolState.processedTxHashes.has(getRemarkKey(remark, index))
    );

    console.log(`   ${unprocessedRemarks.length} unprocessed USER remarks`);

    if (unprocessedRemarks.length === 0) {
      console.log(`✓ No new USER remarks to process`);
      // No new user remarks - safe to move forward to current block
      protocolState.lastProcessedBlock = currentBlock;

      // Cleanup: Clear old processed tx hashes to prevent memory bloat
      // Keep only hashes from recent blocks (last 100 blocks ~20 minutes)
      if (protocolState.processedTxHashes.size > 200) {
        console.log(`   Clearing ${protocolState.processedTxHashes.size} old transaction hashes from memory`);
        protocolState.processedTxHashes.clear();
      }

      return;
    }

    // Process ALL unprocessed USER remarks sequentially
    for (let i = 0; i < unprocessedRemarks.length; i++) {
      const remark = unprocessedRemarks[i];
      const remarkIndex = userRemarks.indexOf(remark);
      const remarkKey = getRemarkKey(remark, remarkIndex);

      await processUserRemark(remark, api, archiveApi);

      // Mark this specific remark as processed
      protocolState.processedTxHashes.add(remarkKey);

      console.log(`\n✓ Processed remark ${i + 1}/${unprocessedRemarks.length} at block ${remark.blockNumber} (tx: ${remark.txHash.slice(0, 10)}...)`);
    }

    // Move forward to the last processed block
    const lastRemark = unprocessedRemarks[unprocessedRemarks.length - 1];
    protocolState.lastProcessedBlock = lastRemark.blockNumber;

  } finally {
    protocolState.isProcessing = false;
  }
}

/**
 * Process a single USER remark
 */
async function processUserRemark(
  parsedRemark: ParsedRemark & { remark: UserRemark },
  api: any,
  archiveApi: any
) {
  const remark = parsedRemark.remark;

  console.log(`\n╔════════════════════════════════════════════════════╗`);
  console.log(`║   PROCESSING USER REMARK                           ║`);
  console.log(`╚════════════════════════════════════════════════════╝`);
  console.log(`Action: ${remark.action}`);
  console.log(`User: ${remark.userColdkey.slice(0, 20)}...`);
  console.log(`Block: ${parsedRemark.blockNumber}`);
  console.log(`Tx Hash: ${parsedRemark.txHash.slice(0, 20)}...`);
  console.log(`Timestamp: ${new Date(remark.timestamp).toISOString()}`);

  // Validate remark
  if (!validateUserRemark(remark)) {
    console.log(`\n❌ Invalid USER remark structure - skipping`);
    return;
  }

  try {
    // Route to appropriate action handler
    switch (remark.action) {
      case UserActionType.DEPOSIT:
        await handleDeposit(remark as any, api);
        break;

      case UserActionType.WITHDRAW:
        await handleWithdraw(remark as any, api);
        break;

      case UserActionType.BORROW:
        await handleBorrow(remark as any, api, archiveApi);
        break;

      case UserActionType.REPAY:
        await handleRepay(remark as any, api);
        break;

      case UserActionType.DEPOSIT_COLLATERAL:
        await handleDepositCollateral(remark as any, api);
        break;

      case UserActionType.WITHDRAW_COLLATERAL:
        await handleWithdrawCollateral(remark as any, api, archiveApi);
        break;

      default:
        console.log(`\n  Unknown action type: ${(remark as any).action}`);
    }

  } catch (error) {
    console.error(`\n❌ Failed to process USER remark:`, error);
    // Continue processing other remarks
  }
}

/**
 * Save state backup after STATE_OF_MARKET is written
 */
async function saveStateBackupAfterAction(api: any) {
  try {
    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();
    const marketState = await MarketStateManager.reconstructMarketState(MARKET_ID);

    // Create state remark object from current state
    const stateRemark: any = {
      marketId: MARKET_ID,
      totalSupplyAssets: marketState.totalSupplyAssets.toString(),
      totalSupplyShares: marketState.totalSupplyShares.toString(),
      totalBorrowAssets: marketState.totalBorrowAssets.toString(),
      totalBorrowShares: marketState.totalBorrowShares.toString(),
      totalReserves: marketState.totalReserves.toString(),
      lastUpdateTimestamp: marketState.lastUpdateTimestamp,
      protocolFee: marketState.protocolFee.toString(),
      protocolFeeShares: marketState.protocolFeeShares.toString(),
      ltv: marketState.ltv.toString(),
      lltv: marketState.lltv.toString(),
      isActive: marketState.isActive,
      userPositions: {}
    };

    // Clean supply dust from market totals before saving
    const SUPPLY_DUST_THRESHOLD = new Decimal('0.00001');
    if (marketState.totalSupplyAssets.abs().gt(0) && marketState.totalSupplyAssets.abs().lt(SUPPLY_DUST_THRESHOLD)) {
      console.log(`   🧹 Cleaning market supply asset dust: ${marketState.totalSupplyAssets.toString()} → 0`);
      marketState.totalSupplyAssets = new Decimal(0);
      stateRemark.totalSupplyAssets = '0';
      MarketStateManager.saveMarketState(marketState);
    }
    if (marketState.totalSupplyShares.abs().gt(0) && marketState.totalSupplyShares.abs().lt(SUPPLY_DUST_THRESHOLD)) {
      console.log(`   🧹 Cleaning market supply share dust: ${marketState.totalSupplyShares.toString()} → 0`);
      marketState.totalSupplyShares = new Decimal(0);
      stateRemark.totalSupplyShares = '0';
      MarketStateManager.saveMarketState(marketState);
    }

    // Add all user positions
    const lenderPositions = PositionStateManager.getAllLenderPositions();
    const borrowerPositions = PositionStateManager.getAllBorrowerPositions();

    for (const position of lenderPositions) {
      if (!stateRemark.userPositions[position.coldkey]) {
        stateRemark.userPositions[position.coldkey] = {
          supplyShares: '0',
          borrowShares: '0',
          collateralAlpha: '0'
        };
      }
      // Clean supply share dust for individual positions
      let supplyShares = position.supplyShares;
      if (supplyShares.abs().gt(0) && supplyShares.abs().lt(SUPPLY_DUST_THRESHOLD)) {
        console.log(`   🧹 Cleaning supply share dust for ${position.coldkey.slice(0, 16)}...: ${supplyShares.toString()} → 0`);
        supplyShares = new Decimal(0);
        position.supplyShares = supplyShares;
        PositionStateManager.saveLenderPosition(position);
      }
      stateRemark.userPositions[position.coldkey].supplyShares = supplyShares.toString();
    }

    for (const position of borrowerPositions) {
      if (!stateRemark.userPositions[position.coldkey]) {
        stateRemark.userPositions[position.coldkey] = {
          supplyShares: '0',
          borrowShares: '0',
          collateralAlpha: '0'
        };
      }
      stateRemark.userPositions[position.coldkey].borrowShares = position.borrowShares.toString();
      stateRemark.userPositions[position.coldkey].collateralAlpha = position.collateralAlpha.toString();
    }

    // Save backup to disk
    await saveStateBackup(currentBlock, protocolState.currentStateNumber, stateRemark);
  } catch (error) {
    console.error('  Failed to save state backup:', error);
    // Don't throw - backup failure shouldn't stop the protocol
  }
}

/**
 * Handle DEPOSIT action (Case A - User sends transaction)
 */
async function handleDeposit(remark: any, api: any) {
  console.log(`\n⟳ Executing DEPOSIT action...`);

  const amountTao = new Decimal(remark.amountTao);

  // Execute deposit (will write STATE_OF_MARKET)
  const result = await DepositAction.executeDeposit(
    {
      coldkey: remark.userColdkey,
      marketId: MARKET_ID,
      amountTao,
      currentTimestamp: Math.floor(remark.timestamp / 1000)
    },
    api,
    PROTOCOL_MNEMONIC,
    remark.linkedTxHash,
    protocolState.currentStateNumber
  );

  if (result.success) {
    protocolState.currentStateNumber += 1;
    console.log(`\n✅ DEPOSIT processed successfully`);
    console.log(`  New state number: ${protocolState.currentStateNumber}`);

    // Save backup after successful STATE_OF_MARKET write
    await saveStateBackupAfterAction(api);
  } else {
    console.log(`\n❌ DEPOSIT failed`);
  }
}

/**
 * Handle WITHDRAW action (Case B - Protocol sends transaction)
 */
async function handleWithdraw(remark: any, api: any) {
  console.log(`\n⟳ Executing WITHDRAW action...`);

  const amountTao = new Decimal(remark.amountTao);

  // Execute withdrawal (will write STATE_OF_MARKET with actions_in_progress, then final STATE_OF_MARKET)
  const result = await WithdrawAction.executeWithdraw(
    {
      coldkey: remark.userColdkey,
      marketId: MARKET_ID,
      amountTao,
      currentTimestamp: Math.floor(remark.timestamp / 1000)
    },
    api,
    PROTOCOL_MNEMONIC,
    protocolState.currentStateNumber
  );

  if (result.success) {
    protocolState.currentStateNumber += 1; // Only the actionInProgress STATE_OF_MARKET is written now
    console.log(`\n✅ WITHDRAW remark processed - awaiting transfer confirmation`);
    console.log(`  State number: ${protocolState.currentStateNumber} (final state written after transfer)`);
    // Do NOT save backup here - backup is saved in finalizeSuccessfulAction after transfer confirms
  } else {
    console.log(`\n❌ WITHDRAW failed`);
  }
}

/**
 * Handle BORROW action (Case B - Protocol sends transaction)
 */
async function handleBorrow(remark: any, api: any, archiveApi: any) {
  console.log(`\n⟳ Executing BORROW action...`);

  const amountTao = new Decimal(remark.amountTao);

  // Execute borrow (will write STATE_OF_MARKET with actions_in_progress, then final STATE_OF_MARKET)
  const result = await BorrowAction.executeBorrow(
    {
      coldkey: remark.userColdkey,
      marketId: MARKET_ID,
      amountTao,
      archiveApi,
      currentTimestamp: Math.floor(remark.timestamp / 1000)
    },
    api,
    PROTOCOL_MNEMONIC,
    protocolState.currentStateNumber
  );

  if (result.success) {
    protocolState.currentStateNumber += 1; // Only the actionInProgress STATE_OF_MARKET is written now
    console.log(`\n✅ BORROW remark processed - awaiting transfer confirmation`);
    console.log(`  State number: ${protocolState.currentStateNumber} (final state written after transfer)`);
    // Do NOT save backup here - backup is saved in finalizeSuccessfulAction after transfer confirms
  } else {
    console.log(`\n❌ BORROW failed`);
  }
}

/**
 * Handle REPAY action (Case A - User sends transaction)
 */
async function handleRepay(remark: any, api: any) {
  console.log(`\n⟳ Executing REPAY action...`);

  const amountTao = new Decimal(remark.amountTao);

  // Execute repay (will write STATE_OF_MARKET)
  const result = await RepayAction.executeRepay(
    {
      coldkey: remark.userColdkey,
      marketId: MARKET_ID,
      amountTao,
      currentTimestamp: Math.floor(remark.timestamp / 1000)
    },
    api,
    PROTOCOL_MNEMONIC,
    remark.linkedTxHash,
    protocolState.currentStateNumber
  );

  if (result.success) {
    protocolState.currentStateNumber += 1;
    console.log(`\n✅ REPAY processed successfully`);
    console.log(`  New state number: ${protocolState.currentStateNumber}`);

    // Save backup after successful STATE_OF_MARKET write
    await saveStateBackupAfterAction(api);
  } else {
    console.log(`\n❌ REPAY failed`);
  }
}

/**
 * Handle DEPOSIT_COLLATERAL action (Case A - User sends transaction)
 */
async function handleDepositCollateral(remark: any, api: any) {
  console.log(`\n⟳ Executing DEPOSIT_COLLATERAL action...`);

  const amountAlpha = new Decimal(remark.amountAlpha);

  // Execute deposit collateral (will write STATE_OF_MARKET)
  const result = await DepositCollateralAction.executeDepositCollateral(
    {
      coldkey: remark.userColdkey,
      marketId: MARKET_ID,
      amountAlpha,
      currentTimestamp: Math.floor(remark.timestamp / 1000)
    },
    api,
    PROTOCOL_MNEMONIC,
    remark.linkedTxHash,
    protocolState.currentStateNumber
  );

  if (result.success) {
    protocolState.currentStateNumber += 1;
    console.log(`\n✅ DEPOSIT_COLLATERAL processed successfully`);
    console.log(`  New state number: ${protocolState.currentStateNumber}`);

    // Save backup after successful STATE_OF_MARKET write
    await saveStateBackupAfterAction(api);
  } else {
    console.log(`\n❌ DEPOSIT_COLLATERAL failed`);
  }
}

/**
 * Handle WITHDRAW_COLLATERAL action (Case B - Protocol sends transaction)
 */
async function handleWithdrawCollateral(remark: any, api: any, archiveApi: any) {
  console.log(`\n⟳ Executing WITHDRAW_COLLATERAL action...`);

  const amountAlpha = new Decimal(remark.amountAlpha);

  // Execute withdraw collateral (will write STATE_OF_MARKET with actions_in_progress, then final STATE_OF_MARKET)
  const result = await WithdrawCollateralAction.executeWithdrawCollateral(
    {
      coldkey: remark.userColdkey,
      marketId: MARKET_ID,
      amountAlpha,
      archiveApi,
      currentTimestamp: Math.floor(remark.timestamp / 1000)
    },
    api,
    PROTOCOL_MNEMONIC,
    protocolState.currentStateNumber
  );

  if (result.success) {
    protocolState.currentStateNumber += 1; // Only the actionInProgress STATE_OF_MARKET is written now
    console.log(`\n✅ WITHDRAW_COLLATERAL remark processed - awaiting transfer confirmation`);
    console.log(`  State number: ${protocolState.currentStateNumber} (final state written after transfer)`);
    // Do NOT save backup here - backup is saved in finalizeSuccessfulAction after transfer confirms
  } else {
    console.log(`\n❌ WITHDRAW_COLLATERAL failed`);
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * ACTION MONITORING - Integrated into scanner
 * Checks for actions_in_progress and executes protocol transactions
 */

/**
 * Check for actions in progress and execute protocol transactions
 */
async function checkActionsInProgress(api: any) {
  // Get current block
  const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

  // ONLY look for STATE_OF_MARKET remarks written AFTER the scanner started
  // Ignore all old remarks from before scanner restart
  const searchRange = currentBlock - protocolState.scannerStartBlock;
  if (searchRange <= 0) {
    return; // No new blocks since scanner started
  }

  const latestState = await getLatestStateOfMarketRemark(api, currentBlock, searchRange);

  if (!latestState) {
    return; // No state found
  }

  // Double-check: ignore remarks from before scanner started
  if (latestState.blockNumber < protocolState.scannerStartBlock) {
    return; // Old remark, ignore
  }

  // Check if we already processed this state
  if (latestState.remark.stateNumber <= protocolState.lastCheckedStateNumber) {
    return; // Already checked
  }

  // Check if action in progress exists
  if (!latestState.remark.actionInProgress) {
    protocolState.lastCheckedStateNumber = latestState.remark.stateNumber;
    return; // No action in progress
  }

  // Action in progress found!
  const actionInProgress = latestState.remark.actionInProgress;

  console.log(`\n ACTION IN PROGRESS DETECTED:`);
  console.log(`  Action: ${actionInProgress.action}`);
  console.log(`  User: ${actionInProgress.userColdkey.slice(0, 20)}...`);

  // Check if transaction already sent
  if (actionInProgress.txHash) {
    // Verify transaction status
    const verification = await verifyTransaction(api, actionInProgress.txHash, 100);

    if (verification.exists && verification.isSuccess) {
      console.log(`  ✅ Transaction succeeded!`);
      await finalizeSuccessfulAction(api, latestState.remark);
      protocolState.lastCheckedStateNumber = latestState.remark.stateNumber;
      return;
    } else if (verification.exists && !verification.isSuccess) {
      console.log(`  ❌ Transaction failed, retrying...`);
      // Will send transaction below
    } else {
      console.log(`   Transaction pending...`);
      return; // Wait for confirmation
    }
  }

  // Send protocol transaction
  console.log(`  ⟳ Sending protocol transaction...`);

  const keyring = new Keyring({ type: 'sr25519' });
  const protocolAccount = keyring.addFromUri(PROTOCOL_MNEMONIC);

  let txHash: string | undefined;

  try {
    switch (actionInProgress.action) {
      case ProtocolActionType.WITHDRAW:
        txHash = await sendWithdrawTransaction(
          api,
          protocolAccount,
          actionInProgress.userColdkey,
          actionInProgress.amountTao || '0'
        );
        break;

      case ProtocolActionType.BORROW:
        txHash = await sendBorrowTransaction(
          api,
          protocolAccount,
          actionInProgress.userColdkey,
          actionInProgress.amountTao || '0'
        );
        break;

      case ProtocolActionType.WITHDRAW_COLLATERAL:
        txHash = await sendWithdrawCollateralTransaction(
          api,
          protocolAccount,
          actionInProgress.userColdkey,
          actionInProgress.amountAlpha || '0'
        );
        break;

      default:
        console.log(`    Unknown action type: ${actionInProgress.action}`);
        return;
    }

    if (txHash) {
      console.log(`  ✅ Transaction sent: ${txHash.slice(0, 20)}...`);
      console.log(`   Waiting for confirmation...`);

      // Wait for transaction to be included in a block
      await sleep(18000); // ~1.5 blocks

      // Verify transaction
      const verification = await verifyTransaction(api, txHash, 10);

      if (verification.exists && verification.isSuccess) {
        console.log(`  ✅ Transaction confirmed!`);
        await finalizeSuccessfulAction(api, latestState.remark);
        protocolState.lastCheckedStateNumber = latestState.remark.stateNumber;
      } else {
        console.log(`   Transaction still pending, will check next cycle...`);
      }
    }
  } catch (error) {
    console.error(`  ❌ Failed to send transaction:`, error);
  }
}

/**
 * Send WITHDRAW transaction (TAO from protocol to user)
 */
async function sendWithdrawTransaction(
  api: any,
  protocolAccount: any,
  userColdkey: string,
  amountTao: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Wait for API to be ready
    if (!api.tx || !api.tx.balances) {
      reject(new Error('API not ready'));
      return;
    }

    const amountRao = new Decimal(amountTao).mul(1e9).floor().toFixed(0);
    const transfer = api.tx.balances.transferKeepAlive(userColdkey, amountRao);

    transfer
      .signAndSend(protocolAccount, ({ status, txHash }: any) => {
        if (status.isInBlock || status.isFinalized) {
          resolve(txHash.toHex());
        }
      })
      .catch((error: Error) => reject(error));
  });
}

/**
 * Send BORROW transaction (TAO from protocol to user)
 */
async function sendBorrowTransaction(
  api: any,
  protocolAccount: any,
  userColdkey: string,
  amountTao: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Wait for API to be ready
    if (!api.tx || !api.tx.balances) {
      reject(new Error('API not ready'));
      return;
    }

    const amountRao = new Decimal(amountTao).mul(1e9).floor().toFixed(0);
    const transfer = api.tx.balances.transferKeepAlive(userColdkey, amountRao);

    transfer
      .signAndSend(protocolAccount, ({ status, txHash }: any) => {
        if (status.isInBlock || status.isFinalized) {
          resolve(txHash.toHex());
        }
      })
      .catch((error: Error) => reject(error));
  });
}

/**
 * Send WITHDRAW_COLLATERAL transaction (Alpha from protocol to user)
 */
async function sendWithdrawCollateralTransaction(
  api: any,
  protocolAccount: any,
  userColdkey: string,
  amountAlpha: string
): Promise<string> {
  const marketId = "44";
  const netuid = parseInt(marketId);

  console.log(`   Using transfer_stake to return collateral...`);

  return transferAlphaFromProtocol(
    api,
    protocolAccount,
    userColdkey,
    amountAlpha,
    netuid,
    MENTAT_HOTKEY
  );
}

/**
 * Finalize successful action by writing final STATE_OF_MARKET
 */
async function finalizeSuccessfulAction(api: any, currentState: StateOfMarketRemark) {
  console.log(`\n⟳ Finalizing action - writing final STATE_OF_MARKET...`);

  try {
    const marketState = await MarketStateManager.reconstructMarketState(MARKET_ID);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const elapsed = currentTimestamp - marketState.lastUpdateTimestamp;
    const blocksElapsed = Math.floor(elapsed / 12);

    const accrualResult = elapsed > 0 && marketState.totalBorrowAssets.gt(0)
      ? InterestCalculations.performAccrual(
          marketState.totalBorrowAssets,
          marketState.totalSupplyAssets,
          marketState.totalSupplyShares,
          marketState.lastUpdateTimestamp,
          currentTimestamp,
          marketState.protocolFee
        )
      : {
          interestAccrued: new Decimal(0),
          borrowRate: new Decimal(0),
          supplyRate: new Decimal(0),
          utilizationRate: new Decimal(0),
          feeShares: new Decimal(0)
        };

    // Get user from actionInProgress
    const userColdkey = currentState.actionInProgress!.userColdkey;

    const lenderPosition = await PositionStateManager.reconstructLenderPosition(userColdkey, MARKET_ID);
    const borrowerPosition = await PositionStateManager.reconstructBorrowerPosition(userColdkey, MARKET_ID);

    const userPositions = new Map();
    userPositions.set(userColdkey, {
      lender: lenderPosition,
      borrower: borrowerPosition
    });

    // Write final STATE_OF_MARKET without actionInProgress
    const result = await writeStateOfMarketRemark(api, PROTOCOL_MNEMONIC, {
      stateNumber: currentState.stateNumber + 1,
      marketState,
      accrualResult,
      timeElapsedSeconds: elapsed,
      blocksElapsed,
      userPositions
      // No actionInProgress - action complete!
    });

    if (result.success) {
      protocolState.currentStateNumber = currentState.stateNumber + 1;
      console.log(`  ✅ Final STATE_OF_MARKET written (state #${protocolState.currentStateNumber})`);

      // Save backup
      await saveStateBackupAfterAction(api);
    } else {
      console.log(`  ❌ Failed to write final STATE_OF_MARKET: ${result.error}`);
    }
  } catch (error) {
    console.error(`\n❌ Failed to finalize action:`, error);
  }
}

/**
 * Check if there are unprocessed user remarks pending
 */
async function hasUnprocessedUserRemarks(api: any): Promise<boolean> {
  try {
    const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

    if (currentBlock <= protocolState.lastProcessedBlock) {
      return false; // No new blocks
    }

    const { userRemarks } = await readNewRemarks(api, protocolState.lastProcessedBlock);
    const unprocessedRemarks = userRemarks.filter(
      remark => !protocolState.processedTxHashes.has(remark.txHash)
    );

    return unprocessedRemarks.length > 0;
  } catch (error) {
    console.error(`Error checking for unprocessed remarks:`, error);
    return true; // Assume there are remarks to be safe
  }
}

/**
 * Check for unhealthy positions and execute liquidations
 */
async function checkLiquidatablePositions(api: any, archiveApi: any) {
  try {
    // Step 1: Get all borrowers with debt
    const borrowers = PositionStateManager.getAllBorrowerPositions()
      .filter(p => p.borrowShares.gt(0));

    if (borrowers.length === 0) {
      return; // No active borrowers
    }

    // Step 2: Get current market state and TWAP price
    const marketState = await MarketStateManager.reconstructMarketState(MARKET_ID);
    const subnetId = parseInt(MARKET_ID);
    const alphaPriceTao = new Decimal(await getAlphaTWAPPrice(archiveApi, subnetId));

    console.log(`\n Checking ${borrowers.length} borrower position(s) for liquidation...`);

    // Step 3: Check each borrower's health
    for (const borrower of borrowers) {
      try {
        const healthMetrics = HealthCalculations.calculateBorrowerMetrics(
          borrower,
          marketState,
          alphaPriceTao
        );

        // Check for dust position - clean it up instead of liquidating
        const DUST_THRESHOLD_TAO = new Decimal("0.00001"); // 10000 RAO - ignore dust below this
        if (healthMetrics.borrowedTao.lt(DUST_THRESHOLD_TAO) && healthMetrics.borrowedTao.gt(0)) {
          console.log(`\n🧹 Dust position detected - cleaning up...`);
          console.log(`   Borrower: ${borrower.coldkey.slice(0, 20)}...`);
          console.log(`   Dust debt: ${healthMetrics.borrowedTao.toFixed(9)} TAO (below ${DUST_THRESHOLD_TAO.toString()} threshold)`);
          console.log(`   Setting borrow shares to 0...`);

          await cleanupDustPosition(api, borrower, marketState);
          continue; // Skip liquidation for dust positions
        }

        // Step 4: Check if liquidatable (health factor < 1.0)
        if (healthMetrics.healthFactor.lt(1)) {
          console.log(`\n╔════════════════════════════════════════════════════╗`);
          console.log(`║     LIQUIDATABLE POSITION FOUND                  ║`);
          console.log(`╚════════════════════════════════════════════════════╝`);
          console.log(`Borrower: ${borrower.coldkey.slice(0, 20)}...`);
          console.log(`Health Factor: ${healthMetrics.healthFactor.toFixed(4)}`);
          console.log(`Collateral: ${borrower.collateralAlpha.toString()} ALPHA`);
          console.log(`Debt: ${healthMetrics.borrowedTao.toFixed(6)} TAO`);
          console.log(`LTV: ${healthMetrics.ltv.mul(100).toFixed(2)}%`);

          // Step 5: Execute liquidation
          await executeLiquidation(api, archiveApi, borrower, marketState, alphaPriceTao);
        }
      } catch (error) {
        console.error(`   ❌ Error checking borrower ${borrower.coldkey.slice(0, 20)}...:`, error);
        // Continue checking other borrowers
      }
    }
  } catch (error) {
    console.error(`\n❌ Error in liquidation scanner:`, error);
  }
}

/**
 * Clean up dust position by setting borrow shares to 0
 * This handles tiny remaining debt amounts (< 0.00001 TAO) that result from rounding
 */
async function cleanupDustPosition(api: any, borrower: any, marketState: any) {
  try {
    console.log(`\n⟳ Cleaning up dust position...`);

    // Calculate dust amounts to remove
    const dustShares = borrower.borrowShares;
    const dustAssets = SharesCalculations.borrowSharesToAssets(
      dustShares,
      marketState.totalBorrowAssets,
      marketState.totalBorrowShares
    );

    console.log(`   Dust borrow shares: ${dustShares.toString()}`);
    console.log(`   Dust borrow assets: ${dustAssets.toString()} TAO`);

    // Update market state - subtract dust from totals
    const updatedMarketState = MarketStateManager.updateStateWithRepay(
      marketState,
      dustAssets,
      dustShares,
      Math.floor(Date.now() / 1000)
    );

    // Force zero if remaining totals are dust (prevent 1e-60 leftovers)
    const DUST_ZERO_THRESHOLD = new Decimal('0.00001');
    if (updatedMarketState.totalBorrowAssets.abs().lt(DUST_ZERO_THRESHOLD)) {
      updatedMarketState.totalBorrowAssets = new Decimal(0);
    }
    if (updatedMarketState.totalBorrowShares.abs().lt(DUST_ZERO_THRESHOLD)) {
      updatedMarketState.totalBorrowShares = new Decimal(0);
    }

    // Set borrower position borrow shares to 0 (clear dust)
    const updatedBorrowerPosition = {
      ...borrower,
      borrowShares: new Decimal(0),
      lastUpdateTimestamp: Math.floor(Date.now() / 1000)
    };

    // Save updated states
    MarketStateManager.saveMarketState(updatedMarketState);
    PositionStateManager.saveBorrowerPosition(updatedBorrowerPosition);

    // Prepare user positions for STATE_OF_MARKET
    const lenderPosition = await PositionStateManager.reconstructLenderPosition(borrower.coldkey, MARKET_ID);
    const userPositions = new Map();
    userPositions.set(borrower.coldkey, {
      lender: lenderPosition,
      borrower: updatedBorrowerPosition
    });

    // Write STATE_OF_MARKET with cleaned position (no accrual since this is just cleanup)
    const result = await writeStateOfMarketRemark(api, PROTOCOL_MNEMONIC, {
      stateNumber: protocolState.currentStateNumber + 1,
      marketState: updatedMarketState,
      accrualResult: {
        interestAccrued: new Decimal(0),
        borrowRate: new Decimal(0),
        supplyRate: new Decimal(0),
        utilizationRate: new Decimal(0),
        feeShares: new Decimal(0)
      },
      timeElapsedSeconds: 0,
      blocksElapsed: 0,
      userPositions
    });

    if (result.success) {
      protocolState.currentStateNumber += 1;
      console.log(`   ✅ Dust cleaned from both user position and market totals`);
      console.log(`   - User borrow shares: 0`);
      console.log(`   - Market total borrow shares reduced by: ${dustShares.toString()}`);
      console.log(`   - Market total borrow assets reduced by: ${dustAssets.toString()} TAO`);
      console.log(`   New state number: ${protocolState.currentStateNumber}`);

      // Save backup after cleanup
      await saveStateBackupAfterAction(api);
    } else {
      console.log(`   ❌ Failed to write cleanup STATE_OF_MARKET: ${result.error}`);
    }
  } catch (error) {
    console.error(`\n❌ Failed to cleanup dust position:`, error);
    // Don't throw - dust cleanup failure shouldn't stop the scanner
  }
}

/**
 * Execute liquidation: unstake seized collateral and update accounting
 */
async function executeLiquidation(
  api: any,
  archiveApi: any,
  borrower: any,
  marketState: any,
  alphaPriceTao: Decimal
) {
  console.log(`\n⟳ Executing liquidation...`);

  try {
    // Step 1: Recalculate health metrics to get current debt
    const healthMetrics = HealthCalculations.calculateBorrowerMetrics(
      borrower,
      marketState,
      alphaPriceTao
    );

    const debtTao = healthMetrics.borrowedTao;
    const liquidationBonus = LiquidationCalculations.calculateLiquidationIncentiveFactor(marketState.lltv);
    const totalTaoNeeded = debtTao.mul(liquidationBonus);
    let alphaToSeize = totalTaoNeeded.div(alphaPriceTao);

    console.log(`   Debt to repay: ${debtTao.toFixed(6)} TAO`);
    console.log(`   Liquidation bonus: ${liquidationBonus.sub(1).mul(100).toFixed(2)}%`);
    console.log(`   Total TAO value needed: ${totalTaoNeeded.toFixed(6)} TAO`);
    console.log(`   ALPHA to seize: ${alphaToSeize.toFixed(6)} ALPHA`);

    // Step 2: Verify sufficient collateral
    if (alphaToSeize.gt(borrower.collateralAlpha)) {
      console.log(`     Insufficient collateral - seizing all available`);
      alphaToSeize = borrower.collateralAlpha;
    }

    // Step 3: UNSTAKE ALPHA → TAO (this is the key operation!)
    console.log(`\n    Unstaking ${alphaToSeize.toFixed(6)} ALPHA from subnet ${MARKET_ID}...`);
    console.log(`   This will convert ALPHA → TAO and return to protocol coldkey`);

    const keyring = new Keyring({ type: "sr25519" });
    const protocolAccount = keyring.addFromMnemonic(PROTOCOL_MNEMONIC);

    const netuid = parseInt(MARKET_ID);
    const unstakeTxHash = await removeStake(
      api,
      protocolAccount,
      MENTAT_HOTKEY,
      alphaToSeize.toString(),
      netuid,
      alphaPriceTao,
      LIQUIDATION_SLIPPAGE_TOLERANCE
    );

    console.log(`   ✓ Unstaked! Protocol received ~${totalTaoNeeded.toFixed(6)} TAO`);
    console.log(`   Transaction: ${unstakeTxHash.slice(0, 20)}...`);

    // Step 4: Calculate how much goes to pool vs reserves
    const protocolBonusAmount = totalTaoNeeded.sub(debtTao);

    console.log(`\n    Distribution:`);
    console.log(`   - Debt repaid (to pool): ${debtTao.toFixed(6)} TAO`);
    console.log(`   - Protocol bonus (to reserves): ${protocolBonusAmount.toFixed(6)} TAO`);

    // Step 5: Update accounting
    const sharesBurned = SharesCalculations.assetsToBorrowShares(
      debtTao,
      marketState.totalBorrowAssets,
      marketState.totalBorrowShares
    );

    let updatedMarketState = MarketStateManager.updateStateWithLiquidation(
      marketState,
      debtTao,
      sharesBurned,
      protocolBonusAmount,
      Math.floor(Date.now() / 1000)
    );

    // Step 5.5: RE-STAKE TAO ON ROOT (if enabled)
    // The liquidation just unstaked ALPHA → TAO, now we need to stake that TAO back on Root
    // Total TAO received = totalTaoNeeded (debt + bonus)
    // This keeps protocol funds earning yield instead of sitting idle
    const rootStakingResult = await stakeOnRootAfterLiquidation(
      api,
      protocolAccount,
      totalTaoNeeded,
      updatedMarketState
    );

    updatedMarketState = rootStakingResult.updatedState;

    if (rootStakingResult.txHash) {
      console.log(`   ✓ Liquidation TAO re-staked on Root for yield`);
    }

    // Update borrower position
    const newCollateralAlpha = borrower.collateralAlpha.sub(alphaToSeize);
    const updatedBorrowerPosition = {
      ...borrower,
      borrowShares: new Decimal(0), // Debt fully repaid
      collateralAlpha: newCollateralAlpha.gt(0) ? newCollateralAlpha : new Decimal(0),
      lastUpdateTimestamp: Math.floor(Date.now() / 1000)
    };

    // Step 6: Save states
    MarketStateManager.saveMarketState(updatedMarketState);
    PositionStateManager.saveBorrowerPosition(updatedBorrowerPosition);

    // Step 7: Write STATE_OF_MARKET remark
    const userPositions = new Map();
    userPositions.set(borrower.coldkey, {
      lender: await PositionStateManager.reconstructLenderPosition(borrower.coldkey, MARKET_ID),
      borrower: updatedBorrowerPosition
    });

    await writeStateOfMarketRemark(api, PROTOCOL_MNEMONIC, {
      stateNumber: protocolState.currentStateNumber + 1,
      marketState: updatedMarketState,
      accrualResult: {
        interestAccrued: new Decimal(0),
        borrowRate: new Decimal(0),
        supplyRate: new Decimal(0),
        utilizationRate: new Decimal(0),
        feeShares: new Decimal(0)
      },
      timeElapsedSeconds: 0,
      blocksElapsed: 0,
      userPositions
    });

    protocolState.currentStateNumber += 1;

    console.log(`\n✅ Liquidation completed successfully!`);
    console.log(`   Borrower debt cleared`);
    console.log(`   Protocol reserves increased by ${protocolBonusAmount.toFixed(6)} TAO`);
    console.log(`   Total reserves: ${updatedMarketState.totalReserves.toString()} TAO`);

    // Save backup
    await saveStateBackupAfterAction(api);

  } catch (error) {
    console.error(`\n❌ Liquidation execution failed:`, error);
    throw error;
  }
}

// Run the protocol loop
runProtocolLoop().catch(error => {
  console.error('\n❌ Protocol scanner crashed:', error);
  process.exit(1);
});
