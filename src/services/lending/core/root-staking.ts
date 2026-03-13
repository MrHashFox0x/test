import Decimal from 'decimal.js';
import type { ApiPromise } from '@polkadot/api';
import { MarketState } from '../types';
import { addStakeToRoot, removeStakeFromRoot, getColdkeyBalance } from '../modules/call/stakeTransfer';
import { ROOT_STAKING_ENABLED, ROOT_STAKING_SLIPPAGE_TOLERANCE } from '../config';
import dotenv from 'dotenv';

dotenv.config();

const PROTOCOL_COLDKEY = process.env.CK_Test_Protocol_Lending || '';
const PROTOCOL_HOTKEY = process.env.Hk_Test_Protocol || '';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_DOWN });

/**
 * ROOT STAKING MODULE
 *
 * Manages staking protocol TAO on Root network (netuid 0) to earn APY
 *
 * Strategy:
 * - Keep protocol coldkey balance at 0 TAO (100% staked on Root)
 * - Stake TAO immediately after deposits/repays
 * - Unstake TAO before withdrawals/borrows
 * - Capture yield from coldkey balance (emissions paid to coldkey, not stake)
 * - Distribute yield to lenders via totalSupplyAssets
 */

/**
 * Capture yield from Root staking and update market state
 *
 * DEPRECATED: This function is based on the wrong assumption that Root yield goes to free balance.
 * In reality, Root yield AUTO-COMPOUNDS into staked balance.
 *
 * Yield is now captured in unstakeFromRootBeforeWithdraw() by comparing:
 * - Expected unstaked amount (what we requested)
 * - Actual free balance after unstake (includes compounded yield)
 *
 * This function is kept for backwards compatibility but should not be used.
 *
 * @param api - Polkadot API instance
 * @param marketState - Current market state
 * @returns Updated market state (no yield captured)
 */
export async function captureRootYield(
  api: ApiPromise,
  marketState: MarketState
): Promise<{ updatedState: MarketState; yieldCaptured: Decimal }> {
  console.warn('⚠️ captureRootYield() is DEPRECATED - Root yield is auto-compounded, not paid to free balance');
  console.warn('   Yield is captured during unstaking operations instead');

  return { updatedState: marketState, yieldCaptured: new Decimal(0) };
}

/**
 * Stake TAO on Root network after deposit or repay
 *
 * IMPORTANT: Root staking yield is AUTO-COMPOUNDED into staked balance, NOT free balance!
 *
 * Flow:
 * 1. User deposits X TAO → protocol coldkey free balance = X
 * 2. Stake X TAO on Root (no yield detection here - yield is in staked balance, not free!)
 * 3. Update totalStakedOnRoot += X
 *
 * @param api - Polkadot API instance
 * @param protocolAccount - Protocol account for signing
 * @param amountTao - Amount of TAO to stake (from deposit/repay)
 * @param marketState - Current market state
 * @returns Updated market state
 */
export async function stakeOnRootAfterDeposit(
  api: ApiPromise,
  protocolAccount: any,
  amountTao: Decimal,
  marketState: MarketState
): Promise<{ updatedState: MarketState; txHash: string | null }> {
  if (!ROOT_STAKING_ENABLED) {
    return { updatedState: marketState, txHash: null };
  }

  console.log(`\n   === Root Staking (Post-Deposit) ===`);

  // STEP 1: Verify coldkey balance
  const balanceBeforeStake = await getColdkeyBalance(api, PROTOCOL_COLDKEY);
  console.log(`   Coldkey free balance: ${balanceBeforeStake.toFixed(6)} TAO`);
  console.log(`   Amount to stake: ${amountTao.toFixed(6)} TAO`);

  // Sanity check: we should have at least the deposit amount
  if (balanceBeforeStake.lt(amountTao)) {
    console.warn(`   ⚠️ Warning: Free balance (${balanceBeforeStake.toFixed(6)}) < deposit amount (${amountTao.toFixed(6)})`);
    console.warn(`   This may be due to transaction fees`);
  }

  // STEP 2: Stake the deposit amount on Root
  // NOTE: We do NOT look for yield in free balance - Root yield auto-compounds into staked balance!
  console.log(`   Staking ${amountTao.toFixed(6)} TAO on Root...`);

  const taoPriceRao = new Decimal(1e9);

  const txHash = await addStakeToRoot(
    api,
    protocolAccount,
    PROTOCOL_HOTKEY,
    amountTao.toFixed(9),
    taoPriceRao,
    ROOT_STAKING_SLIPPAGE_TOLERANCE
  );

  // STEP 3: Update totalStakedOnRoot (only add the deposit amount, not any "yield")
  const finalState: MarketState = {
    ...marketState,
    totalStakedOnRoot: marketState.totalStakedOnRoot.add(amountTao),
  };

  console.log(`   ✓ Staked ${amountTao.toFixed(6)} TAO on Root`);
  console.log(`   Total staked on Root (tracked): ${finalState.totalStakedOnRoot.toFixed(6)} TAO`);
  console.log(`   ===================================\n`);

  return { updatedState: finalState, txHash };
}

/**
 * Unstake TAO from Root network before withdrawal or borrow
 *
 * IMPORTANT: Root yield auto-compounds into staked balance!
 * When we unstake, we receive: principal + accumulated yield
 *
 * Flow:
 * 1. Need Y TAO for user withdrawal
 * 2. Unstake Y TAO from Root
 * 3. Check free balance after unstake - if (after - before) > Y, the difference is YIELD
 * 4. Add yield to totalSupplyAssets (distributed to all lenders)
 * 5. Update totalStakedOnRoot -= Y (only subtract what we needed, yield stays in stake tracking)
 *
 * @param api - Polkadot API instance
 * @param protocolAccount - Protocol account for signing
 * @param amountTao - Amount of TAO to unstake (for withdrawal/borrow)
 * @param marketState - Current market state
 * @returns Updated market state and coldkey balance after unstake
 */
export async function unstakeFromRootBeforeWithdraw(
  api: ApiPromise,
  protocolAccount: any,
  amountTao: Decimal,
  marketState: MarketState
): Promise<{ updatedState: MarketState; txHash: string | null; balanceAfterUnstake: Decimal }> {
  if (!ROOT_STAKING_ENABLED) {
    return { updatedState: marketState, txHash: null, balanceAfterUnstake: new Decimal(0) };
  }

  console.log(`\n   === Root Unstaking (Pre-Withdrawal) ===`);

  // STEP 1: Record coldkey balance BEFORE unstaking
  const balanceBeforeUnstake = await getColdkeyBalance(api, PROTOCOL_COLDKEY);
  console.log(`   Coldkey free balance before unstake: ${balanceBeforeUnstake.toFixed(6)} TAO`);

  // STEP 2: Unstake the requested amount from Root
  console.log(`   Need ${amountTao.toFixed(6)} TAO for user withdrawal`);
  console.log(`   Unstaking ${amountTao.toFixed(6)} TAO from Root...`);

  const taoPriceRao = new Decimal(1e9);

  const txHash = await removeStakeFromRoot(
    api,
    protocolAccount,
    PROTOCOL_HOTKEY,
    amountTao.toFixed(9),
    taoPriceRao,
    ROOT_STAKING_SLIPPAGE_TOLERANCE
  );

  // STEP 3: Check coldkey free balance AFTER unstaking
  const balanceAfterUnstake = await getColdkeyBalance(api, PROTOCOL_COLDKEY);
  console.log(`   Coldkey free balance after unstake: ${balanceAfterUnstake.toFixed(6)} TAO`);

  // Yield = (balanceAfter - balanceBefore) - amountRequested
  // balanceAfter - balanceBefore gives us what the unstake actually returned
  // Subtracting amountTao gives us the excess = yield
  const actualReturned = balanceAfterUnstake.sub(balanceBeforeUnstake);
  console.log(`   Actual TAO returned from unstake: ${actualReturned.toFixed(6)} TAO`);
  console.log(`   Expected: ${amountTao.toFixed(6)} TAO`);

  let updatedState = marketState;

  // STEP 4: Detect and capture yield
  const yieldAmount = actualReturned.sub(amountTao);

  if (yieldAmount.gt(0.0001)) { // Threshold to avoid dust
    console.log(`   ✓ ROOT YIELD DETECTED: ${yieldAmount.toFixed(6)} TAO`);
    console.log(`   This is compounded yield from Root staking`);
    console.log(`   Adding yield to totalSupplyAssets (distributed to all lenders)`);

    updatedState = {
      ...marketState,
      totalSupplyAssets: marketState.totalSupplyAssets.add(yieldAmount),
    };
  } else if (yieldAmount.lt(-0.0001)) {
    console.warn(`    Warning: Received LESS than expected (${balanceAfterUnstake.toFixed(6)} < ${amountTao.toFixed(6)})`);
    console.warn(`   Difference: ${yieldAmount.toFixed(6)} TAO`);
    console.warn(`   This may be due to transaction fees or slippage`);
  } else {
    console.log(`   No yield detected (balance matches unstaked amount)`);
  }

  // STEP 5: Update totalStakedOnRoot
  // We ONLY subtract the amount we requested, NOT the yield
  // The yield was already part of the compounded staked balance
  const finalState: MarketState = {
    ...updatedState,
    totalStakedOnRoot: updatedState.totalStakedOnRoot.sub(amountTao),
  };

  console.log(`   ✓ Unstaked ${amountTao.toFixed(6)} TAO from Root (+ ${yieldAmount.toFixed(6)} yield)`);
  console.log(`   Total staked on Root (tracked): ${finalState.totalStakedOnRoot.toFixed(6)} TAO`);
  console.log(`   =======================================\n`);

  return { updatedState: finalState, txHash, balanceAfterUnstake };
}

/**
 * Stake TAO on Root network after liquidation
 *
 * After liquidating a position, we unstake ALPHA → TAO. This TAO needs to be
 * re-staked on Root to continue earning yield.
 *
 * IMPORTANT: Root yield auto-compounds, so we don't look for yield in free balance!
 *
 * Flow:
 * 1. Liquidation completed → TAO in coldkey free balance
 * 2. Stake the liquidation TAO amount on Root
 * 3. Update totalStakedOnRoot += liquidationTao
 *
 * Note: The liquidation TAO includes both debt repayment and protocol bonus.
 * The accounting (totalBorrowAssets, totalReserves) is already updated before calling this.
 *
 * @param api - Polkadot API instance
 * @param protocolAccount - Protocol account for signing
 * @param liquidationTao - Total TAO received from liquidation (debt + bonus)
 * @param marketState - Current market state (after liquidation accounting)
 * @returns Updated market state
 */
export async function stakeOnRootAfterLiquidation(
  api: ApiPromise,
  protocolAccount: any,
  liquidationTao: Decimal,
  marketState: MarketState
): Promise<{ updatedState: MarketState; txHash: string | null }> {
  if (!ROOT_STAKING_ENABLED) {
    return { updatedState: marketState, txHash: null };
  }

  console.log(`\n   === Root Staking (Post-Liquidation) ===`);

  // STEP 1: Verify coldkey balance
  const balanceBeforeStake = await getColdkeyBalance(api, PROTOCOL_COLDKEY);
  console.log(`   Coldkey free balance: ${balanceBeforeStake.toFixed(6)} TAO`);
  console.log(`   Liquidation TAO to stake: ${liquidationTao.toFixed(6)} TAO`);

  // Sanity check
  if (balanceBeforeStake.lt(liquidationTao)) {
    console.warn(`    Warning: Free balance (${balanceBeforeStake.toFixed(6)}) < liquidation amount (${liquidationTao.toFixed(6)})`);
    console.warn(`   This may be due to transaction fees`);
  }

  // STEP 2: Stake the liquidation TAO on Root
  // NOTE: We do NOT look for yield in free balance - Root yield auto-compounds into staked balance!
  console.log(`   Staking ${liquidationTao.toFixed(6)} TAO on Root...`);

  const taoPriceRao = new Decimal(1e9);

  const txHash = await addStakeToRoot(
    api,
    protocolAccount,
    PROTOCOL_HOTKEY,
    liquidationTao.toFixed(9),
    taoPriceRao,
    ROOT_STAKING_SLIPPAGE_TOLERANCE
  );

  // STEP 3: Update totalStakedOnRoot (only add the liquidation amount)
  const finalState: MarketState = {
    ...marketState,
    totalStakedOnRoot: marketState.totalStakedOnRoot.add(liquidationTao),
  };

  console.log(`   ✓ Staked ${liquidationTao.toFixed(6)} TAO on Root`);
  console.log(`   Total staked on Root (tracked): ${finalState.totalStakedOnRoot.toFixed(6)} TAO`);
  console.log(`   =======================================\n`);

  return { updatedState: finalState, txHash };
}
