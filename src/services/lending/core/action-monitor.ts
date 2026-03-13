import dotenv from "dotenv";
import { Keyring } from "@polkadot/api";
import { connectToArchiveNode } from "../utils/provider";
import { getLatestStateOfMarketRemark } from "../utils/remark-reader";
import { writeStateOfMarketRemark } from "../utils/remark-writer";
import { verifyTransaction } from "../utils/transaction-verifier";
import type { StateOfMarketRemark, ActionInProgress, ProtocolActionType } from "../types";
import { MarketStateManager } from "../state/market-state";
import { PositionStateManager } from "../state/position-state";
import { InterestCalculations } from "./interest-calculations";
import { transferAlphaFromProtocol } from "../modules/call/stakeTransfer";
import Decimal from "decimal.js";

dotenv.config();

const PROTOCOL_MNEMONIC = process.env.CK_Test_Protocol_Lending_MNEMONIC || "";
const MENTAT_HOTKEY = process.env.HK_Mentat || "";
const MONITOR_INTERVAL_MS = 12000; // 12 seconds (1 block)
const TX_TIMEOUT_SECONDS = 300; // 5 minutes

/**
 * ACTION MONITOR
 *
 * This script monitors actions_in_progress from STATE_OF_MARKET remarks
 * and verifies if transactions succeeded or failed
 * This script handles:
 * 1. Read latest STATE_OF_MARKET
 * 2. Check if actionInProgress exists
 * 3. Verify transaction status
 * 4. Write final STATE_OF_MARKET or retry on failure
 */

interface MonitorState {
  lastCheckedStateNumber: number;
  retryCount: Map<string, number>; 
}

let monitorState: MonitorState = {
  lastCheckedStateNumber: 0,
  retryCount: new Map()
};

/**
 * Main monitor loop
 */
async function runMonitorLoop() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║   ACTION MONITOR STARTING                          ║');
  console.log('║   Monitoring actions_in_progress...                ║');
  console.log('╚════════════════════════════════════════════════════╝\n');

  const api = await connectToArchiveNode();

  try {
    while (true) {
      try {
        await checkActionsInProgress(api);
      } catch (error) {
        console.error(`\n❌ Error in monitor cycle:`, error);
        console.log(`⟳ Continuing to next cycle...\n`);
      }

      // Wait before next check
      await sleep(MONITOR_INTERVAL_MS);
    }

  } catch (error) {
    console.error('\n❌ Fatal error in monitor loop:', error);
  } finally {
    await api.disconnect();
  }
}

/**
 * Check for actions in progress and verify their status
 */
async function checkActionsInProgress(api: any) {
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`\nChecking for actions in progress...`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // Get current block
  const currentBlock = (await api.rpc.chain.getHeader()).number.toNumber();

  // Get latest STATE_OF_MARKET remark
  const latestState = await getLatestStateOfMarketRemark(api, currentBlock, 1000);

  if (!latestState) {
    console.log(`\n❌ No STATE_OF_MARKET remark found`);
    return;
  }

  console.log(`\nLatest STATE_OF_MARKET:`);
  console.log(`  State number: ${latestState.remark.stateNumber}`);
  console.log(`  Block: ${latestState.blockNumber}`);
  console.log(`  Timestamp: ${new Date(latestState.remark.timestamp).toISOString()}`);

  // Check if we already processed this state
  if (latestState.remark.stateNumber <= monitorState.lastCheckedStateNumber) {
    console.log(`\n✓ Already checked this state - no new actions`);
    return;
  }

  // Check if action in progress exists
  if (!latestState.remark.actionInProgress) {
    console.log(`\n✓ No action in progress`);
    monitorState.lastCheckedStateNumber = latestState.remark.stateNumber;
    return;
  }

  // Action in progress found!
  const actionInProgress = latestState.remark.actionInProgress;

  console.log(`\nAction in progress detected:`);
  console.log(`  Action: ${actionInProgress.action}`);
  console.log(`  User: ${actionInProgress.userColdkey.slice(0, 20)}...`);
  console.log(`  Initiated: ${new Date(actionInProgress.timestampInitiated * 1000).toISOString()}`);
  if (actionInProgress.txHash) {
    console.log(`  Tx Hash: ${actionInProgress.txHash.slice(0, 20)}...`);
  }

  // Check if transaction exists
  if (!actionInProgress.txHash) {
    console.log(`\n❌ No transaction hash found - transaction may not have been sent yet`);

    // Check timeout
    const elapsed = Math.floor(Date.now() / 1000) - actionInProgress.timestampInitiated;
    if (elapsed > TX_TIMEOUT_SECONDS) {
      console.log(`\n❌ Action timed out (${elapsed}s > ${TX_TIMEOUT_SECONDS}s)`);
      console.log(`⟳ Retrying action...`);
      await retryAction(api, latestState.remark, actionInProgress);
    }
    return;
  }

  // Verify transaction status
  console.log(`\n⟳ Verifying transaction status...`);
  const txStatus = await checkTransactionStatus(api, actionInProgress.txHash);

  if (txStatus === 'success') {
    console.log(`  ✅ Transaction succeeded!`);
    await finalizeSuccessfulAction(api, latestState.remark);
  } else if (txStatus === 'failed') {
    console.log(`  ❌ Transaction failed!`);
    await retryAction(api, latestState.remark, actionInProgress);
  } else {
    console.log(`\nTransaction pending...`);

    // Check timeout
    const elapsed = Math.floor(Date.now() / 1000) - actionInProgress.timestampInitiated;
    if (elapsed > TX_TIMEOUT_SECONDS) {
      console.log(`\n❌ Transaction timed out (${elapsed}s > ${TX_TIMEOUT_SECONDS}s)`);
      console.log(`⟳ Retrying action...`);
      await retryAction(api, latestState.remark, actionInProgress);
    }
  }

  monitorState.lastCheckedStateNumber = latestState.remark.stateNumber;
}

/**
 * Check transaction status on blockchain using the transaction verifier
 */
async function checkTransactionStatus(api: any, txHash: string): Promise<'success' | 'failed' | 'pending'> {
  try {
    // Use the transaction verifier utility
    const verification = await verifyTransaction(api, txHash, 100);

    if (!verification.exists) {
      // Transaction not found in recent blocks
      return 'pending';
    }

    if (!verification.isFinalized) {
      // Transaction exists but not finalized yet
      return 'pending';
    }

    if (verification.isSuccess) {
      // Transaction succeeded
      console.log(`  Found transaction in block ${verification.blockNumber}`);
      return 'success';
    } else {
      // Transaction failed
      console.log(`  Transaction failed in block ${verification.blockNumber}`);
      console.log(`  Error: ${verification.error}`);
      return 'failed';
    }

  } catch (error) {
    console.error(`  ❌ Error checking transaction status:`, error);
    return 'pending';
  }
}

/**
 * Finalize successful action by writing final STATE_OF_MARKET
 */
async function finalizeSuccessfulAction(api: any, currentState: StateOfMarketRemark) {
  console.log(`\n⟳ Finalizing successful action...`);
  console.log(`  Writing final STATE_OF_MARKET...`);

  try {
    const marketId = "44";

    // Reconstruct market state
    const marketState = await MarketStateManager.reconstructMarketState(marketId);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const elapsed = currentTimestamp - marketState.lastUpdateTimestamp;
    const blocksElapsed = Math.floor(elapsed / 12);

    // Calculate accrual
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

    // Reconstruct all user positions
    const userPositions = new Map();

    // Write final STATE_OF_MARKET
    const result = await writeStateOfMarketRemark(api, PROTOCOL_MNEMONIC, {
      stateNumber: currentState.stateNumber + 1,
      marketState,
      accrualResult,
      timeElapsedSeconds: elapsed,
      blocksElapsed,
      userPositions
    });

    if (result.success) {
      console.log(`  ✅ Final STATE_OF_MARKET written`);
      console.log(`  New state number: ${currentState.stateNumber + 1}`);
    } else {
      console.log(`  ❌ Failed to write final STATE_OF_MARKET: ${result.error}`);
    }

  } catch (error) {
    console.error(`\n❌ Failed to finalize action:`, error);
  }
}

/**
 * Retry failed action
 */
async function retryAction(api: any, currentState: StateOfMarketRemark, actionInProgress: ActionInProgress) {
  const actionKey = `${actionInProgress.action}_${actionInProgress.userColdkey}`;
  const retryCount = (monitorState.retryCount.get(actionKey) || 0) + 1;

  console.log(`\n⟳ Retrying action (attempt ${retryCount})...`);

  if (retryCount > 3) {
    console.log(`\n❌ Max retry attempts reached (3) - marking action as failed`);

    // Write final STATE_OF_MARKET without actionInProgress to clear the failed action
    try {
      console.log(`⟳ Clearing failed action from STATE_OF_MARKET...`);
      await finalizeSuccessfulAction(api, currentState);
      console.log(`\nAction marked as FAILED after 3 retry attempts`);
      console.log(`Manual intervention may be required for user: ${actionInProgress.userColdkey.slice(0, 20)}...`);
    } catch (error) {
      console.error(`❌ Failed to clear failed action:`, error);
    }

    monitorState.retryCount.delete(actionKey);
    return;
  }

  monitorState.retryCount.set(actionKey, retryCount);

  try {
    // Setup keyring for transaction signing
    const keyring = new Keyring({ type: 'sr25519' });
    const protocolAccount = keyring.addFromUri(PROTOCOL_MNEMONIC);

    let txHash: string | undefined;

    // Retry the transaction based on action type
    switch (actionInProgress.action) {
      case 'WITHDRAW':
        console.log(`  Retrying WITHDRAW transaction...`);
        txHash = await sendWithdrawTransaction(
          api,
          protocolAccount,
          actionInProgress.userColdkey,
          actionInProgress.amountTao || '0'
        );
        break;

      case 'BORROW':
        console.log(`  Retrying BORROW transaction...`);
        txHash = await sendBorrowTransaction(
          api,
          protocolAccount,
          actionInProgress.userColdkey,
          actionInProgress.amountTao || '0'
        );
        break;

      case 'WITHDRAW_COLLATERAL':
        console.log(`  Retrying WITHDRAW_COLLATERAL transaction...`);
        txHash = await sendWithdrawCollateralTransaction(
          api,
          protocolAccount,
          actionInProgress.userColdkey,
          actionInProgress.amountAlpha || '0'
        );
        break;

      case 'LIQUIDATE':
        console.log(`  Retrying LIQUIDATE transaction...`);
        // Liquidation requires additional parameters
        console.log(`LIQUIDATE retry requires manual intervention - complex parameters`);
        break;

      default:
        console.log(`\nUnknown action type: ${actionInProgress.action}`);
    }

    if (txHash) {
      console.log(`  ✅ Retry transaction sent: ${txHash.slice(0, 20)}...`);

      // Update the STATE_OF_MARKET with new txHash
      await updateActionWithNewTxHash(api, currentState, actionInProgress, txHash);
    }

  } catch (error) {
    console.error(`\n❌ Failed to retry action:`, error);
  }
}

/**
 * Send WITHDRAW transaction to user
 */
async function sendWithdrawTransaction(
  api: any,
  protocolAccount: any,
  userColdkey: string,
  amountTao: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Create transfer transaction from protocol to user
    const transfer = api.tx.balances.transfer(
      userColdkey,
      api.registry.createType('Balance', new Decimal(amountTao).mul(1e9).floor().toFixed(0))
    );

    transfer
      .signAndSend(protocolAccount, ({ status, txHash }: any) => {
        if (status.isInBlock || status.isFinalized) {
          resolve(txHash.toHex());
        }
      })
      .catch((error: Error) => {
        reject(error);
      });
  });
}

/**
 * Send BORROW transaction to user
 */
async function sendBorrowTransaction(
  api: any,
  protocolAccount: any,
  userColdkey: string,
  amountTao: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    // Create transfer transaction from protocol to user (borrowed funds)
    const transfer = api.tx.balances.transfer(
      userColdkey,
      api.registry.createType('Balance', new Decimal(amountTao).mul(1e9).floor().toFixed(0))
    );

    transfer
      .signAndSend(protocolAccount, ({ status, txHash }: any) => {
        if (status.isInBlock || status.isFinalized) {
          resolve(txHash.toHex());
        }
      })
      .catch((error: Error) => {
        reject(error);
      });
  });
}

/**
 * Send WITHDRAW_COLLATERAL transaction to user
 *
 */
async function sendWithdrawCollateralTransaction(
  api: any,
  protocolAccount: any,
  userColdkey: string,
  amountAlpha: string
): Promise<string> {
  try {
    const marketId = "44";
    const netuid = parseInt(marketId);

    console.log(`   Using transfer_stake to return collateral...`);
    console.log(`   Subnet: ${netuid}`);
    console.log(`   Hotkey: ${MENTAT_HOTKEY.slice(0, 20)}... (TaoStats)`);

    const txHash = await transferAlphaFromProtocol(
      api,
      protocolAccount,
      userColdkey,
      amountAlpha,
      netuid,
      MENTAT_HOTKEY  
    );

    return txHash;
  } catch (error) {
    console.error(`   ❌ Failed to send withdraw collateral transaction:`, error);
    throw error;
  }
}

/**
 * Update STATE_OF_MARKET with new transaction hash after retry
 */
async function updateActionWithNewTxHash(
  api: any,
  currentState: StateOfMarketRemark,
  actionInProgress: ActionInProgress,
  newTxHash: string
) {
  try {
    console.log(`\n⟳ Updating STATE_OF_MARKET with new txHash...`);

    const marketId = "44";

    // Reconstruct market state
    const marketState = await MarketStateManager.reconstructMarketState(marketId);
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const elapsed = currentTimestamp - marketState.lastUpdateTimestamp;
    const blocksElapsed = Math.floor(elapsed / 12);

    // Calculate accrual
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

    // Get user positions
    const userPositions = new Map();

    const updatedAction = {
      ...actionInProgress,
      txHash: newTxHash,
      timestampInitiated: currentTimestamp 
    };

    const result = await writeStateOfMarketRemark(api, PROTOCOL_MNEMONIC, {
      stateNumber: currentState.stateNumber + 1,
      marketState,
      accrualResult,
      timeElapsedSeconds: elapsed,
      blocksElapsed,
      userPositions,
      actionInProgress: updatedAction
    });

    if (result.success) {
      console.log(`\n✓ STATE_OF_MARKET updated with new txHash`);
    } else {
      console.log(`\n❌ Failed to update STATE_OF_MARKET: ${result.error}`);
    }

  } catch (error) {
    console.error(`\n❌ Failed to update STATE_OF_MARKET:`, error);
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run the monitor loop
runMonitorLoop().catch(error => {
  console.error('\n❌ Action monitor crashed:', error);
  process.exit(1);
});
