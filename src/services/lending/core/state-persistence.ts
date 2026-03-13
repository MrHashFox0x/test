import fs from 'fs';
import path from 'path';
import Decimal from 'decimal.js';
import { Storage } from '@google-cloud/storage';
import { CONFIG } from '../config';

/**
 * STATE PERSISTENCE SYSTEM
 *
 * Backs up the latest STATE_OF_MARKET to disk for recovery after scanner restart.
 * to avoid scanning the entire blockchain history on every restart.
 *
 * The backup contains:
 * - Latest STATE_OF_MARKET remark content
 * - Block number of the state
 * - Timestamp of backup
 *
 * Usage:
 * - Scanner writes to backup after each STATE_OF_MARKET remark
 * - On restart, scanner can optionally restore from backup (--restore flag)
 */

const BACKUP_DIR = path.join(process.cwd(), '.protocol-state-backup');
const BACKUP_FILE = path.join(BACKUP_DIR, 'latest-state.json');
const GCS_BUCKET = CONFIG.STATE_BACKUP_GCS_BUCKET;
const GCS_OBJECT = CONFIG.STATE_BACKUP_GCS_OBJECT;
const storage = new Storage();

export interface StateBackup {
  blockNumber: number;
  timestamp: number;
  stateNumber: number;
  marketStates: {
    [marketId: string]: {
      totalSupplyAssets: string;
      totalSupplyShares: string;
      totalBorrowAssets: string;
      totalBorrowShares: string;
      totalReserves: string;
      lastUpdateTimestamp: number;
      protocolFee: string;
      protocolFeeShares?: string;
      ltv: string;
      lltv: string;
      totalStakedOnRoot: string;
      isActive: boolean;
      // IRM configuration
      irmParams: {
        optimalUtilizationRate: string;
        baseRate: string;
        slope1: string;
        slope2: string;
      };
      adaptiveIrmParams: {
        targetUtilization: string;
        adjustmentSpeed: string;
        curveSteepness: string;
        initialRateAtTarget: string;
        minRateAtTarget: string;
        maxRateAtTarget: string;
      };
      adaptiveState: {
        rateAtTarget: string;
        lastUpdateTimestamp: number;
      };
    };
  };
  userPositions: {
    [coldkey: string]: {
      supplyShares: string;
      borrowShares: string;
      collateralAlpha: string;
    };
  };
}

/**
 * Ensure backup directory exists
 */
function ensureBackupDir(): void {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }
}

async function uploadStateBackupToGCS(
  blockNumber: number,
  stateNumber: number
): Promise<void> {
  try {
    await storage.bucket(GCS_BUCKET).upload(BACKUP_FILE, {
      destination: GCS_OBJECT,
      metadata: {
        contentType: 'application/json'
      }
    });

    console.log(`State backup uploaded to GCS: gs://${GCS_BUCKET}/${GCS_OBJECT} (block ${blockNumber}, state #${stateNumber})`);
  } catch (error) {
    console.error(`❌ Error uploading state backup to GCS:`, error);
  }
}

/**
 * Save state to disk backup
 */
export async function saveStateBackup(
  blockNumber: number,
  stateNumber: number,
  stateRemark: any
): Promise<void> {
  try {
    ensureBackupDir();

    const backup: StateBackup = {
      blockNumber,
      timestamp: Date.now(),
      stateNumber,
      marketStates: {},
      userPositions: {}
    };

    // Extract market state from remark
    const marketId = stateRemark.marketId || '0'; 
    backup.marketStates[marketId] = {
      totalSupplyAssets: stateRemark.totalSupplyAssets?.toString() || '0',
      totalSupplyShares: stateRemark.totalSupplyShares?.toString() || '0',
      totalBorrowAssets: stateRemark.totalBorrowAssets?.toString() || '0',
      totalBorrowShares: stateRemark.totalBorrowShares?.toString() || '0',
      totalReserves: stateRemark.totalReserves?.toString() || '0',
      lastUpdateTimestamp: stateRemark.lastUpdateTimestamp || Math.floor(Date.now() / 1000),
      protocolFee: stateRemark.protocolFee?.toString() || '0.03',
      protocolFeeShares: stateRemark.protocolFeeShares?.toString() || '0',
      ltv: stateRemark.ltv?.toString() || '0.50',
      lltv: stateRemark.lltv?.toString() || '0.75',
      totalStakedOnRoot: stateRemark.totalStakedOnRoot?.toString() || '0',
      isActive: stateRemark.isActive !== undefined ? stateRemark.isActive : true,
      // IRM configuration
      irmParams: {
        optimalUtilizationRate: stateRemark.irmParams?.optimalUtilizationRate?.toString() || '0.8',
        baseRate: stateRemark.irmParams?.baseRate?.toString() || '0.02',
        slope1: stateRemark.irmParams?.slope1?.toString() || '0.04',
        slope2: stateRemark.irmParams?.slope2?.toString() || '0.75'
      },
      adaptiveIrmParams: {
        targetUtilization: stateRemark.adaptiveIrmParams?.targetUtilization?.toString() || '0.8',
        adjustmentSpeed: stateRemark.adaptiveIrmParams?.adjustmentSpeed?.toString() || '0.5',
        curveSteepness: stateRemark.adaptiveIrmParams?.curveSteepness?.toString() || '3.0',
        initialRateAtTarget: stateRemark.adaptiveIrmParams?.initialRateAtTarget?.toString() || '0.10',
        minRateAtTarget: stateRemark.adaptiveIrmParams?.minRateAtTarget?.toString() || '0.01',
        maxRateAtTarget: stateRemark.adaptiveIrmParams?.maxRateAtTarget?.toString() || '2.0'
      },
      adaptiveState: {
        rateAtTarget: stateRemark.adaptiveState?.rateAtTarget?.toString() || '0.05',
        lastUpdateTimestamp: stateRemark.adaptiveState?.lastUpdateTimestamp || Math.floor(Date.now() / 1000)
      }
    };

    // Extract user positions from remark
    if (stateRemark.userPositions) {
      for (const [coldkey, position] of Object.entries(stateRemark.userPositions)) {
        const pos = position as any;
        backup.userPositions[coldkey] = {
          supplyShares: pos.supplyShares?.toString() || '0',
          borrowShares: pos.borrowShares?.toString() || '0',
          collateralAlpha: pos.collateralAlpha?.toString() || '0'
        };
      }
    }

    // Write to file (atomic write with temp file)
    const tempFile = BACKUP_FILE + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(backup, null, 2), 'utf-8');
    fs.renameSync(tempFile, BACKUP_FILE);

    console.log(`State backup saved: block ${blockNumber}, state #${stateNumber}`);
    await uploadStateBackupToGCS(blockNumber, stateNumber);
  } catch (error) {
    console.error('❌ Error saving state backup:', error);
    // Don't throw - backup failure shouldn't crash the scanner
  }
}

/**
 * Load state from disk backup
 * Returns null if no backup exists or if backup is invalid
 */
export function loadStateBackup(): StateBackup | null {
  try {
    if (!fs.existsSync(BACKUP_FILE)) {
      console.log('No state backup found');
      return null;
    }

    const data = fs.readFileSync(BACKUP_FILE, 'utf-8');
    const backup: StateBackup = JSON.parse(data);

    console.log(`State backup found:`);
    console.log(`   Block: ${backup.blockNumber}`);
    console.log(`   State #: ${backup.stateNumber}`);
    console.log(`   Timestamp: ${new Date(backup.timestamp).toISOString()}`);
    console.log(`   Markets: ${Object.keys(backup.marketStates).length}`);
    console.log(`   Users: ${Object.keys(backup.userPositions).length}`);

    return backup;
  } catch (error) {
    console.error('❌ Error loading state backup:', error);
    return null;
  }
}

/**
 * Delete state backup
 * Used for starting fresh in test mode
 */
export function clearStateBackup(): void {
  try {
    if (fs.existsSync(BACKUP_FILE)) {
      fs.unlinkSync(BACKUP_FILE);
      console.log('State backup cleared');
    }
  } catch (error) {
    console.error('❌ Error clearing state backup:', error);
  }
}

/**
 * Restore state managers from backup
 * Populates in-memory state from saved backup
 */
export function restoreStateFromBackup(
  backup: StateBackup,
  MarketStateManager: any,
  PositionStateManager: any
): void {
  console.log('⟳ Restoring state from backup...');

  // Restore market states
  for (const [marketId, marketData] of Object.entries(backup.marketStates)) {
    const marketState = {
      marketId,
      totalSupplyAssets: new Decimal(marketData.totalSupplyAssets),
      totalSupplyShares: new Decimal(marketData.totalSupplyShares),
      totalBorrowAssets: new Decimal(marketData.totalBorrowAssets),
      totalBorrowShares: new Decimal(marketData.totalBorrowShares),
      totalReserves: new Decimal(marketData.totalReserves),
      lastUpdateTimestamp: marketData.lastUpdateTimestamp,
      protocolFee: new Decimal(marketData.protocolFee),
      protocolFeeShares: new Decimal(marketData.protocolFeeShares || '0'),
      ltv: new Decimal(marketData.ltv),
      lltv: new Decimal(marketData.lltv),
      totalStakedOnRoot: new Decimal(marketData.totalStakedOnRoot || '0'),
      isActive: marketData.isActive,
      // Restore IRM configuration
      irmParams: {
        optimalUtilizationRate: new Decimal(marketData.irmParams.optimalUtilizationRate),
        baseRate: new Decimal(marketData.irmParams.baseRate),
        slope1: new Decimal(marketData.irmParams.slope1),
        slope2: new Decimal(marketData.irmParams.slope2)
      },
      adaptiveIrmParams: {
        targetUtilization: new Decimal(marketData.adaptiveIrmParams.targetUtilization),
        adjustmentSpeed: new Decimal(marketData.adaptiveIrmParams.adjustmentSpeed),
        curveSteepness: new Decimal(marketData.adaptiveIrmParams.curveSteepness),
        initialRateAtTarget: new Decimal(marketData.adaptiveIrmParams.initialRateAtTarget),
        minRateAtTarget: new Decimal(marketData.adaptiveIrmParams.minRateAtTarget),
        maxRateAtTarget: new Decimal(marketData.adaptiveIrmParams.maxRateAtTarget)
      },
      adaptiveState: {
        rateAtTarget: new Decimal(marketData.adaptiveState.rateAtTarget),
        lastUpdateTimestamp: marketData.adaptiveState.lastUpdateTimestamp
      }
    };

    MarketStateManager.saveMarketState(marketState);
    console.log(`   ✓ Restored market ${marketId} (with IRM state)`);
  }

  // Restore user positions
  for (const [coldkey, positionData] of Object.entries(backup.userPositions)) {
    const supplyShares = new Decimal(positionData.supplyShares);
    const borrowShares = new Decimal(positionData.borrowShares);
    const collateralAlpha = new Decimal(positionData.collateralAlpha);

    // Restore lender position if they have supply shares
    if (supplyShares.gt(0)) {
      const marketId = Object.keys(backup.marketStates)[0] || '0'; // Use first market
      const lenderPosition = {
        coldkey,
        marketId,
        supplyShares,
        lastUpdateTimestamp: backup.timestamp
      };
      PositionStateManager.saveLenderPosition(lenderPosition);
    }

    // Restore borrower position if they have borrows or collateral
    if (borrowShares.gt(0) || collateralAlpha.gt(0)) {
      const marketId = Object.keys(backup.marketStates)[0] || '0'; // Use first market
      const borrowerPosition = {
        coldkey,
        marketId,
        borrowShares,
        collateralAlpha,
        lastUpdateTimestamp: backup.timestamp
      };
      PositionStateManager.saveBorrowerPosition(borrowerPosition);
    }
  }

  console.log(`✓ State restored from backup (${Object.keys(backup.userPositions).length} users)`);
}

/**
 * Check if backup should be used based on CLI args
 */
export function shouldRestoreFromBackup(): boolean {
  const args = process.argv.slice(2);
  return args.includes('--restore') || args.includes('-r');
}

/**
 * Get startup mode from CLI args
 */
export function getStartupMode(): 'fresh' | 'restore' {
  if (shouldRestoreFromBackup()) {
    return 'restore';
  }
  return 'fresh';
}

/**
 * Print startup help message
 */
export function printStartupHelp(): void {
  console.log('\nScanner Startup Modes:\n');
  console.log('   npm run scanner              → Start FRESH (ignore backup, reset to block 0)');
  console.log('   npm run scanner -- --restore → RESTORE from backup (continue from last state)');
  console.log('   npm run scanner -- -r        → RESTORE (short flag)\n');
  console.log('Use FRESH mode for testing, RESTORE mode for production\n');
}
