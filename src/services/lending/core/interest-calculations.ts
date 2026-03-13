import Decimal from 'decimal.js';
import { AccrualResult, AdaptiveIRMParams } from '../types';
import { DEFAULT_IRM_PARAMS, DEFAULT_ADAPTIVE_IRM_PARAMS } from '../config';
import { AdaptiveIRM } from '../irm/adaptiveIRM';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_DOWN });


// Global IRM instance
const globalIRM = new AdaptiveIRM(DEFAULT_IRM_PARAMS, DEFAULT_ADAPTIVE_IRM_PARAMS);

export class InterestCalculations {
  /**
   * Get the global IRM instance
   */
  static getIRM(): AdaptiveIRM {
    return globalIRM;
  }

  /**
   * Perform complete interest accrual calculation for a market
   */
  static performAccrual(
    totalBorrowAssets: Decimal,
    totalSupplyAssets: Decimal,
    totalSupplyShares: Decimal,
    lastUpdateTimestamp: number,
    currentTimestamp: number,
    protocolFee: Decimal = new Decimal('0.03')
  ): AccrualResult {
    // Calculate time elapsed
    const timeElapsed = currentTimestamp - lastUpdateTimestamp;
    
    // Calculate current rates using global IRM
    const rates = globalIRM.calculateRates(totalBorrowAssets, totalSupplyAssets, protocolFee, currentTimestamp);
    
    // Calculate accrued interest
    const interestAccrued = timeElapsed > 0 
      ? globalIRM.accrueInterest(totalBorrowAssets, rates.borrowRate, timeElapsed)
      : new Decimal(0);
    
    // Calculate fee shares to mint
    const feeShares = globalIRM.calculateFeeShares(
      interestAccrued,
      protocolFee,
      totalSupplyAssets,
      totalSupplyShares
    );

    return {
      interestAccrued,
      borrowRate: rates.borrowRate,
      supplyRate: rates.supplyRate,
      utilizationRate: rates.utilizationRate,
      feeShares
    };
  }

  /**
   * Update IRM parameters 
   */
  static updateIRMParameters(newParams: Partial<AdaptiveIRMParams>): void {
    globalIRM.updateAdaptiveParams(newParams);
  }

  /**
   * Get current IRM parameters
   */
  static getIRMParameters(): AdaptiveIRMParams {
    return globalIRM.getAdaptiveParams();
  }

  /**
   * Reset IRM state 
   */
  static resetIRMState(): void {
    globalIRM.resetAdaptiveState();
  }

  /**
   * Get current IRM adaptive state
   */
  static getIRMState() {
    return globalIRM.getAdaptiveState();
  }
}