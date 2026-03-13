import Decimal from 'decimal.js';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_DOWN });

export class LiquidationCalculations {
  /**
   * Calculate the Liquidation Incentive Factor (LIF) based on LLTV
   * Formula: LIF = 1 + (liquidation bonus)
   */
  static calculateLiquidationIncentiveFactor(lltv: Decimal): Decimal {
    const baseLIF = new Decimal('1.15'); // 15% bonus
    const minLIF = new Decimal('1.05');  // 5% bonus

    const lifRange = baseLIF.sub(minLIF);
    const lltvNormalized = new Decimal('1').sub(lltv); 
    const lif = minLIF.add(lifRange.mul(lltvNormalized));

    return lif;
  }

  /**
   * Calculate the maximum amount that can be liquidated
   * When health factor < 1, the position is liquidatable
   */
  static calculateMaxLiquidatable(
    borrowedTao: Decimal,
    healthFactor: Decimal
  ): Decimal {
    return borrowedTao;
  }

  /**
   * Calculate the amount of collateral to seize for a given repay amount
   * Formula: Collateral to Seize = (Repay Amount * LIF) / Alpha Price
   */
  static calculateCollateralToSeize(
    repayAmountTao: Decimal,
    lif: Decimal,
    alphaPriceTao: Decimal
  ): Decimal {
    if (alphaPriceTao.isZero()) {
      throw new Error('Alpha price cannot be zero');
    }

    const valueToSeize = repayAmountTao.mul(lif);

    const collateralAlphaToSeize = valueToSeize.div(alphaPriceTao);

    return collateralAlphaToSeize;
  }

  /**
   * Calculate the liquidation bonus in TAO
   * Formula: Bonus = Repay Amount * (LIF - 1)
   */
  static calculateLiquidationBonus(
    repayAmountTao: Decimal,
    lif: Decimal
  ): Decimal {
    const bonusFactor = lif.sub(new Decimal('1'));
    return repayAmountTao.mul(bonusFactor);
  }

  /**
   * Check if there's bad debt after liquidation
   */
  static checkBadDebt(
    totalDebtTao: Decimal,
    totalCollateralValueTao: Decimal
  ): boolean {
    return totalCollateralValueTao.lt(totalDebtTao);
  }

  /**
   * Calculate the actual repay amount accounting for available collateral
   */
  static calculateActualRepayAmount(
    requestedRepayTao: Decimal,
    maxLiquidatableTao: Decimal,
    availableCollateralAlpha: Decimal,
    alphaPriceTao: Decimal,
    lif: Decimal
  ): Decimal {
    let actualRepay = Decimal.min(requestedRepayTao, maxLiquidatableTao);

    const requiredCollateral = this.calculateCollateralToSeize(
      actualRepay,
      lif,
      alphaPriceTao
    );

    if (requiredCollateral.gt(availableCollateralAlpha)) {
      actualRepay = availableCollateralAlpha.mul(alphaPriceTao).div(lif);
    }

    return actualRepay;
  }

  /**
   * Calculate remaining debt after liquidation
   */
  static calculateRemainingDebt(
    currentDebtTao: Decimal,
    repaidTao: Decimal
  ): Decimal {
    const remaining = currentDebtTao.sub(repaidTao);
    return remaining.gt(0) ? remaining : new Decimal(0);
  }

  /**
   * Calculate remaining collateral after liquidation
   */
  static calculateRemainingCollateral(
    currentCollateralAlpha: Decimal,
    seizedAlpha: Decimal
  ): Decimal {
    const remaining = currentCollateralAlpha.sub(seizedAlpha);
    return remaining.gt(0) ? remaining : new Decimal(0);
  }

  /**
   * Validate that a position is liquidatable
   * Returns true if health factor < 1
   */
  static isPositionLiquidatable(healthFactor: Decimal): boolean {
    return healthFactor.lt(new Decimal('1'));
  }

  /**
   * Calculate the effective liquidation price received by liquidator
   */
  static calculateEffectiveLiquidationPrice(
    repayAmountTao: Decimal,
    collateralSeizedAlpha: Decimal
  ): Decimal {
    if (collateralSeizedAlpha.isZero()) {
      return new Decimal(0);
    }

    return repayAmountTao.div(collateralSeizedAlpha);
  }
}
