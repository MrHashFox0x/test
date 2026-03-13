import Decimal from 'decimal.js';
import { BorrowerMetrics, MarketState, BorrowerPositionState } from '../types';
import { SharesCalculations } from './shares-calculations';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_DOWN });

export class HealthCalculations {
  /**
   * Calculate borrowed TAO from borrow shares
   */
  static calculateBorrowedTao(
    borrowShares: Decimal,
    totalBorrowAssets: Decimal,
    totalBorrowShares: Decimal
  ): Decimal {
    return SharesCalculations.borrowSharesToAssets(
      borrowShares,
      totalBorrowAssets,
      totalBorrowShares
    );
  }

  /**
   * Calculate collateral value in TAO
   */
  static calculateCollateralValueTao(
    collateralAlpha: Decimal,
    alphaPriceTao: Decimal
  ): Decimal {
    return collateralAlpha.mul(alphaPriceTao);
  }

  /**
   * Calculate Loan-to-Value ratio
   */
  static calculateLtv(
    borrowedTao: Decimal,
    collateralValueTao: Decimal
  ): Decimal {
    if (collateralValueTao.isZero()) {
      return new Decimal(0);
    }
    return borrowedTao.div(collateralValueTao);
  }

  /**
   * Calculate health factor
   * Health Factor = (Collateral Value * LLTV) / Borrowed
   * If HF < 1, position is liquidatable
   */
  static calculateHealthFactor(
    collateralValueTao: Decimal,
    borrowedTao: Decimal,
    lltv: Decimal
  ): Decimal {
    if (borrowedTao.isZero()) {
      return new Decimal(Infinity);
    }
    return collateralValueTao.mul(lltv).div(borrowedTao);
  }

  /**
   * Calculate liquidation price for alpha
   * Price at which health factor = 1
   * Liquidation Price = Borrowed / (Collateral Alpha * LLTV)
   */
  static calculateLiquidationPrice(
    borrowedTao: Decimal,
    collateralAlpha: Decimal,
    lltv: Decimal
  ): Decimal {
    if (collateralAlpha.isZero() || lltv.isZero()) {
      return new Decimal(0);
    }
    return borrowedTao.div(collateralAlpha.mul(lltv));
  }

  /**
   * Calculate maximum borrowable TAO
   * Max Borrowable = (Collateral Value * LTV) - Currently Borrowed
   */
  static calculateMaxBorrowable(
    collateralValueTao: Decimal,
    borrowedTao: Decimal,
    ltv: Decimal
  ): Decimal {
    const maxTotal = collateralValueTao.mul(ltv);
    const maxAdditional = maxTotal.sub(borrowedTao);
    return maxAdditional.gt(0) ? maxAdditional : new Decimal(0);
  }

  /**
   * Calculate complete borrower metrics
   */
  static calculateBorrowerMetrics(
    borrowerPosition: BorrowerPositionState,
    marketState: MarketState,
    alphaPriceTao: Decimal
  ): BorrowerMetrics {
    // Calculate borrowed TAO from shares
    const borrowedTao = this.calculateBorrowedTao(
      borrowerPosition.borrowShares,
      marketState.totalBorrowAssets,
      marketState.totalBorrowShares
    );

    // Calculate collateral value in TAO
    const collateralValueTao = this.calculateCollateralValueTao(
      borrowerPosition.collateralAlpha,
      alphaPriceTao
    );

    // Calculate LTV (actual current ratio)
    const ltv = this.calculateLtv(borrowedTao, collateralValueTao);

    // Calculate health factor
    const healthFactor = this.calculateHealthFactor(
      collateralValueTao,
      borrowedTao,
      marketState.lltv
    );

    // Calculate liquidation price
    const liquidationPrice = this.calculateLiquidationPrice(
      borrowedTao,
      borrowerPosition.collateralAlpha,
      marketState.lltv
    );

    // Calculate max borrowable
    const maxBorrowable = this.calculateMaxBorrowable(
      collateralValueTao,
      borrowedTao,
      marketState.ltv
    );

    return {
      borrowedTao,
      collateralValueTao,
      ltv,
      healthFactor,
      liquidationPrice,
      maxBorrowable
    };
  }

  /**
   * Check if position is healthy (health factor >= 1)
   */
  static isPositionHealthy(
    collateralValueTao: Decimal,
    borrowedTao: Decimal,
    lltv: Decimal
  ): boolean {
    const healthFactor = this.calculateHealthFactor(
      collateralValueTao,
      borrowedTao,
      lltv
    );
    return healthFactor.gte(1);
  }
}
