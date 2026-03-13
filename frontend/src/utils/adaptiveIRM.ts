/**
 * Adaptive Interest Rate Model (IRM) Calculator for Frontend
 *
 * Calculates current borrow and supply APYs based on market state from scanner backup.
 * Uses time-based adaptive rate adjustment without needing a live server.
 */

import Decimal from 'decimal.js';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_DOWN });

const SECONDS_PER_YEAR = 31_536_000;
const WAD = new Decimal('1000000000'); // 1e9 for TAO native (RAO)

export interface AdaptiveIRMParams {
  targetUtilization: string;
  adjustmentSpeed: string;
  curveSteepness: string;
  initialRateAtTarget: string;
  minRateAtTarget: string;
  maxRateAtTarget: string;
}

export interface AdaptiveState {
  rateAtTarget: string;
  lastUpdateTimestamp: number;
}

export interface MarketStateData {
  totalSupplyAssets: string;
  totalBorrowAssets: string;
  totalBorrowShares: string;
  totalSupplyShares: string;
  lastUpdateTimestamp: number;
  protocolFee: string;
  adaptiveIrmParams: AdaptiveIRMParams;
  adaptiveState: AdaptiveState;
}

/**
 * Calculate utilization rate
 */
function calculateUtilizationRate(
  totalBorrowAssets: Decimal,
  totalSupplyAssets: Decimal
): Decimal {
  if (totalSupplyAssets.isZero()) {
    return new Decimal(0);
  }
  return totalBorrowAssets.div(totalSupplyAssets);
}

/**
 * Custom exponential function using Taylor series approximation
 */
function wExp(x: Decimal): Decimal {
  const one = WAD;
  const x2 = x.mul(x).div(WAD);
  const x3 = x2.mul(x).div(WAD);
  const x4 = x3.mul(x).div(WAD);
  const x5 = x4.mul(x).div(WAD);

  const term1 = x;
  const term2 = x2.div(2);
  const term3 = x3.div(6);
  const term4 = x4.div(24);
  const term5 = x5.div(120);

  return one.add(term1).add(term2).add(term3).add(term4).add(term5);
}

/**
 * Calculate adaptive curve adjustment based on utilization
 */
function calculateCurve(
  utilizationRate: Decimal,
  params: AdaptiveIRMParams
): Decimal {
  const targetUtilization = new Decimal(params.targetUtilization);
  const curveSteepness = new Decimal(params.curveSteepness);

  if (utilizationRate.gte(targetUtilization)) {
    // Above target: exponential increase
    const excessUtilization = utilizationRate.sub(targetUtilization);
    const exponent = curveSteepness.mul(excessUtilization);

    // Cap the exponent to prevent overflow
    const cappedExponent = Decimal.min(exponent, new Decimal('10'));
    return new Decimal(Math.exp(parseFloat(cappedExponent.toString())));
  } else {
    // Below target: exponential decrease (reciprocal)
    const deficitUtilization = targetUtilization.sub(utilizationRate);
    const exponent = curveSteepness.mul(deficitUtilization);

    // Cap the exponent to prevent underflow
    const cappedExponent = Decimal.min(exponent, new Decimal('10'));
    return new Decimal(1 / Math.exp(parseFloat(cappedExponent.toString())));
  }
}

/**
 * Update the rate at target based on time elapsed and utilization
 */
function updateRateAtTarget(
  currentRateAtTarget: Decimal,
  utilizationRate: Decimal,
  lastUpdateTimestamp: number,
  currentTimestamp: number,
  params: AdaptiveIRMParams
): Decimal {
  const timeElapsed = currentTimestamp - lastUpdateTimestamp;
  if (timeElapsed <= 0) return currentRateAtTarget;

  const targetUtilization = new Decimal(params.targetUtilization);
  const adjustmentSpeed = new Decimal(params.adjustmentSpeed);
  const minRateAtTarget = new Decimal(params.minRateAtTarget);
  const maxRateAtTarget = new Decimal(params.maxRateAtTarget);

  // Calculate utilization error (positive when above target, negative when below)
  const utilizationError = utilizationRate.sub(targetUtilization);

  // Linear adaptation: (adjustmentSpeed / seconds_per_year) * timeElapsed * utilizationError
  const linearAdaptation = adjustmentSpeed
    .div(SECONDS_PER_YEAR)
    .mul(timeElapsed)
    .mul(utilizationError);

  // Apply exponential adjustment: rateAtTarget * exp(linearAdaptation)
  const exponentialFactor = wExp(linearAdaptation);
  const newRateAtTarget = currentRateAtTarget
    .mul(exponentialFactor)
    .div(WAD);

  // Bound the new rate within min and max limits
  return Decimal.max(
    minRateAtTarget,
    Decimal.min(maxRateAtTarget, newRateAtTarget)
  );
}

/**
 * Calculate current borrow APY from market state
 */
export function calculateBorrowAPY(marketState: MarketStateData): number {
  try {
    const totalSupplyAssets = new Decimal(marketState.totalSupplyAssets);
    const totalBorrowAssets = new Decimal(marketState.totalBorrowAssets);

    // Calculate utilization rate
    const utilizationRate = calculateUtilizationRate(totalBorrowAssets, totalSupplyAssets);

    // Get current timestamp
    const currentTimestamp = Math.floor(Date.now() / 1000);

    // Update rate at target based on time elapsed
    const currentRateAtTarget = new Decimal(marketState.adaptiveState.rateAtTarget);
    const updatedRateAtTarget = updateRateAtTarget(
      currentRateAtTarget,
      utilizationRate,
      marketState.adaptiveState.lastUpdateTimestamp,
      currentTimestamp,
      marketState.adaptiveIrmParams
    );

    // Calculate curve adjustment
    const curveMultiplier = calculateCurve(utilizationRate, marketState.adaptiveIrmParams);

    // Final borrow rate: rateAtTarget * curveMultiplier
    const borrowRate = updatedRateAtTarget.mul(curveMultiplier);

    // Convert to APY (rate is already annual)
    return parseFloat(borrowRate.toString());
  } catch (error) {
    console.error('Error calculating borrow APY:', error);
    return 0;
  }
}

/**
 * Calculate current supply APY from market state
 * Supply APY = Borrow APY × Utilization × (1 - Protocol Fee)
 */
export function calculateSupplyAPY(marketState: MarketStateData): number {
  try {
    const totalSupplyAssets = new Decimal(marketState.totalSupplyAssets);
    const totalBorrowAssets = new Decimal(marketState.totalBorrowAssets);
    const protocolFee = new Decimal(marketState.protocolFee);

    // Calculate utilization rate
    const utilizationRate = calculateUtilizationRate(totalBorrowAssets, totalSupplyAssets);

    // Get borrow APY
    const borrowAPY = new Decimal(calculateBorrowAPY(marketState));

    // Supply APY = borrowAPY × utilization × (1 - protocolFee)
    const supplyAPY = borrowAPY
      .mul(utilizationRate)
      .mul(new Decimal(1).sub(protocolFee));

    return parseFloat(supplyAPY.toString());
  } catch (error) {
    console.error('Error calculating supply APY:', error);
    return 0;
  }
}

/**
 * Calculate utilization rate as percentage
 */
export function calculateUtilizationRatePercent(marketState: MarketStateData): number {
  try {
    const totalSupplyAssets = new Decimal(marketState.totalSupplyAssets);
    const totalBorrowAssets = new Decimal(marketState.totalBorrowAssets);

    const utilizationRate = calculateUtilizationRate(totalBorrowAssets, totalSupplyAssets);

    return parseFloat(utilizationRate.mul(100).toString());
  } catch (error) {
    console.error('Error calculating utilization rate:', error);
    return 0;
  }
}

/**
 * Calculate available liquidity
 */
export function calculateLiquidity(marketState: MarketStateData): number {
  try {
    const totalSupplyAssets = new Decimal(marketState.totalSupplyAssets);
    const totalBorrowAssets = new Decimal(marketState.totalBorrowAssets);

    const liquidity = totalSupplyAssets.sub(totalBorrowAssets);

    return parseFloat(liquidity.toString());
  } catch (error) {
    console.error('Error calculating liquidity:', error);
    return 0;
  }
}

/**
 * Calculate a user's outstanding debt (borrow shares → assets with accrued interest)
 * Same logic as backend: accrue interest on totalBorrowAssets, then convert shares to assets
 */
export function calculateOutstandingDebt(
  borrowShares: string,
  marketState: MarketStateData
): number {
  try {
    const userBorrowShares = new Decimal(borrowShares);
    if (userBorrowShares.isZero()) return 0;

    const totalBorrowAssets = new Decimal(marketState.totalBorrowAssets);
    const totalBorrowShares = new Decimal(marketState.totalBorrowShares);
    if (totalBorrowShares.isZero()) return 0;

    const currentTimestamp = Math.floor(Date.now() / 1000);
    const timeElapsed = currentTimestamp - marketState.lastUpdateTimestamp;

    // Get current borrow rate (reuses calculateBorrowAPY logic)
    const borrowRate = new Decimal(calculateBorrowAPY(marketState));

    // Accrue interest: same compound formula as backend accrueInterest()
    // interest = totalBorrow * (rate*t + (rate*t)^2/2 + (rate*t)^3/6)
    let accruedTotalBorrow = totalBorrowAssets;
    if (timeElapsed > 0 && !totalBorrowAssets.isZero()) {
      const timeRatio = new Decimal(timeElapsed).div(SECONDS_PER_YEAR);
      const x = borrowRate.mul(timeRatio);
      const compound = x.add(x.pow(2).div(2)).add(x.pow(3).div(6));
      const interestAccrued = totalBorrowAssets.mul(compound);
      accruedTotalBorrow = totalBorrowAssets.add(interestAccrued);
    }

    // User debt = borrowShares * (accruedTotalBorrowAssets / totalBorrowShares)
    const debt = userBorrowShares.mul(accruedTotalBorrow).div(totalBorrowShares);

    return parseFloat(debt.toString());
  } catch (error) {
    console.error('Error calculating outstanding debt:', error);
    return 0;
  }
}

/**
 * Debt at last protocol state update (no accrual since then).
 * Used to show "interest portion" = currentDebt - debtAtLastUpdate.
 */
export function calculateDebtAtLastUpdate(
  borrowShares: string,
  marketState: MarketStateData
): number {
  try {
    const userBorrowShares = new Decimal(borrowShares);
    if (userBorrowShares.isZero()) return 0;

    const totalBorrowAssets = new Decimal(marketState.totalBorrowAssets);
    const totalBorrowShares = new Decimal(marketState.totalBorrowShares);
    if (totalBorrowShares.isZero()) return 0;

    const debt = userBorrowShares.mul(totalBorrowAssets).div(totalBorrowShares);
    return parseFloat(debt.toString());
  } catch (error) {
    console.error('Error calculating debt at last update:', error);
    return 0;
  }
}

export interface RepayBreakdown {
  currentDebt: number;
  debtAtLastUpdate: number;
  interestPortion: number;
  amountRepaid: number;
  interestPortionOfRepay: number;
  remainingDebt: number;
}

/**
 * Breakdown for a repay: actual amounts and interest component (effective rates).
 */
export function getRepayBreakdown(
  borrowShares: string,
  repayAmountTao: number,
  marketState: MarketStateData
): RepayBreakdown | null {
  try {
    const currentDebt = calculateOutstandingDebt(borrowShares, marketState);
    const debtAtLastUpdate = calculateDebtAtLastUpdate(borrowShares, marketState);
    const interestPortion = Math.max(0, currentDebt - debtAtLastUpdate);
    const amountRepaid = Math.min(repayAmountTao, currentDebt);
    const interestPortionOfRepay =
      currentDebt > 0 ? (amountRepaid / currentDebt) * interestPortion : 0;
    const remainingDebt = Math.max(0, currentDebt - amountRepaid);
    return {
      currentDebt,
      debtAtLastUpdate,
      interestPortion,
      amountRepaid,
      interestPortionOfRepay,
      remainingDebt,
    };
  } catch (error) {
    console.error('Error getting repay breakdown:', error);
    return null;
  }
}

/**
 * Supply-side accrual: interest added to totalSupplyAssets, fee shares minted.
 * Returns updated totalSupplyAssets and totalSupplyShares (same as backend updateStateWithAccrual).
 */
function getAccruedSupplyState(marketState: MarketStateData): {
  totalSupplyAssets: Decimal;
  totalSupplyShares: Decimal;
} {
  const totalSupplyAssets = new Decimal(marketState.totalSupplyAssets);
  const totalSupplyShares = new Decimal(marketState.totalSupplyShares);
  const totalBorrowAssets = new Decimal(marketState.totalBorrowAssets);
  const protocolFee = new Decimal(marketState.protocolFee);

  const currentTimestamp = Math.floor(Date.now() / 1000);
  const timeElapsed = currentTimestamp - marketState.lastUpdateTimestamp;

  if (timeElapsed <= 0 || totalBorrowAssets.isZero()) {
    return { totalSupplyAssets, totalSupplyShares };
  }

  const borrowRate = new Decimal(calculateBorrowAPY(marketState));
  const timeRatio = new Decimal(timeElapsed).div(SECONDS_PER_YEAR);
  const x = borrowRate.mul(timeRatio);
  const compound = x.add(x.pow(2).div(2)).add(x.pow(3).div(6));
  const interestAccrued = totalBorrowAssets.mul(compound);

  if (interestAccrued.lte(0)) return { totalSupplyAssets, totalSupplyShares };

  const feeAmount = interestAccrued.mul(protocolFee);
  const feeShares = totalSupplyShares.isZero()
    ? feeAmount
    : feeAmount.mul(totalSupplyShares).div(totalSupplyAssets);

  return {
    totalSupplyAssets: totalSupplyAssets.add(interestAccrued),
    totalSupplyShares: totalSupplyShares.add(feeShares),
  };
}

/**
 * Current supply position value in TAO including accrued yield (effective value).
 */
export function calculateSupplyValueWithAccrual(
  supplyShares: string,
  marketState: MarketStateData
): number {
  try {
    const userSupplyShares = new Decimal(supplyShares);
    if (userSupplyShares.isZero()) return 0;

    const { totalSupplyAssets, totalSupplyShares } = getAccruedSupplyState(marketState);
    if (totalSupplyShares.isZero()) return 0;

    const value = userSupplyShares.mul(totalSupplyAssets).div(totalSupplyShares);
    return parseFloat(value.toString());
  } catch (error) {
    console.error('Error calculating supply value with accrual:', error);
    return 0;
  }
}

/**
 * Supply position value at last protocol update (no accrual since then).
 */
export function calculateSupplyValueAtLastUpdate(
  supplyShares: string,
  marketState: MarketStateData
): number {
  try {
    const userSupplyShares = new Decimal(supplyShares);
    if (userSupplyShares.isZero()) return 0;

    const totalSupplyAssets = new Decimal(marketState.totalSupplyAssets);
    const totalSupplyShares = new Decimal(marketState.totalSupplyShares);
    if (totalSupplyShares.isZero()) return 0;

    const value = userSupplyShares.mul(totalSupplyAssets).div(totalSupplyShares);
    return parseFloat(value.toString());
  } catch (error) {
    console.error('Error calculating supply value at last update:', error);
    return 0;
  }
}

export interface WithdrawBreakdown {
  positionValueWithAccrual: number;
  positionValueAtLastUpdate: number;
  yieldSinceLastUpdate: number;
  amountToReceive: number;
  yieldPortionOfWithdraw: number;
}

/**
 * Breakdown for a withdraw: actual amount received and yield component (effective gain).
 */
export function getWithdrawBreakdown(
  supplyShares: string,
  withdrawAmountTao: number,
  marketState: MarketStateData
): WithdrawBreakdown | null {
  try {
    const positionValueWithAccrual = calculateSupplyValueWithAccrual(supplyShares, marketState);
    const positionValueAtLastUpdate = calculateSupplyValueAtLastUpdate(supplyShares, marketState);
    const yieldSinceLastUpdate = Math.max(0, positionValueWithAccrual - positionValueAtLastUpdate);
    const amountToReceive = Math.min(withdrawAmountTao, positionValueWithAccrual);
    const yieldPortionOfWithdraw =
      positionValueWithAccrual > 0
        ? (amountToReceive / positionValueWithAccrual) * yieldSinceLastUpdate
        : 0;
    return {
      positionValueWithAccrual,
      positionValueAtLastUpdate,
      yieldSinceLastUpdate,
      amountToReceive,
      yieldPortionOfWithdraw,
    };
  } catch (error) {
    console.error('Error getting withdraw breakdown:', error);
    return null;
  }
}
