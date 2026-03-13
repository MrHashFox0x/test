import Decimal from 'decimal.js';

Decimal.set({ precision: 50, rounding: Decimal.ROUND_DOWN });

export class SharesCalculations {
  /**
   * Convert assets to supply shares
   * shares = assets * totalShares / totalAssets
   * If no shares exist, ratio is 1:1
   */
  static assetsToSupplyShares(
    assets: Decimal,
    totalSupplyAssets: Decimal,
    totalSupplyShares: Decimal
  ): Decimal {
    if (assets.isZero()) {
      return new Decimal(0);
    }

    if (totalSupplyShares.isZero() || totalSupplyAssets.isZero()) {
      // First deposit: 1:1 ratio
      return assets;
    }

    // shares = assets * totalShares / totalAssets
    return assets.mul(totalSupplyShares).div(totalSupplyAssets);
  }

  /**
   * Convert supply shares to assets
   * assets = shares * totalAssets / totalShares
   */
  static supplySharesToAssets(
    shares: Decimal,
    totalSupplyAssets: Decimal,
    totalSupplyShares: Decimal
  ): Decimal {
    if (shares.isZero() || totalSupplyShares.isZero()) {
      return new Decimal(0);
    }

    // assets = shares * totalAssets / totalShares
    return shares.mul(totalSupplyAssets).div(totalSupplyShares);
  }

  /**
   * Convert assets to borrow shares
   * shares = assets * totalShares / totalAssets
   * If no shares exist, ratio is 1:1
   */
  static assetsToBorrowShares(
    assets: Decimal,
    totalBorrowAssets: Decimal,
    totalBorrowShares: Decimal
  ): Decimal {
    if (assets.isZero()) {
      return new Decimal(0);
    }

    if (totalBorrowShares.isZero() || totalBorrowAssets.isZero()) {
      // First borrow: 1:1 ratio
      return assets;
    }

    // shares = assets * totalShares / totalAssets
    return assets.mul(totalBorrowShares).div(totalBorrowAssets);
  }

  /**
   * Convert borrow shares to assets
   * assets = shares * totalAssets / totalShares
   */
  static borrowSharesToAssets(
    shares: Decimal,
    totalBorrowAssets: Decimal,
    totalBorrowShares: Decimal
  ): Decimal {
    if (shares.isZero() || totalBorrowShares.isZero()) {
      return new Decimal(0);
    }

    // assets = shares * totalAssets / totalShares
    return shares.mul(totalBorrowAssets).div(totalBorrowShares);
  }

  /**
   * Calculate exchange rate for supply shares
   * rate = totalAssets / totalShares
   */
  static getSupplySharesExchangeRate(
    totalSupplyAssets: Decimal,
    totalSupplyShares: Decimal
  ): Decimal {
    if (totalSupplyShares.isZero()) {
      return new Decimal(1); // 1:1 when no shares exist
    }

    return totalSupplyAssets.div(totalSupplyShares);
  }

  /**
   * Calculate exchange rate for borrow shares
   * rate = totalAssets / totalShares
   */
  static getBorrowSharesExchangeRate(
    totalBorrowAssets: Decimal,
    totalBorrowShares: Decimal
  ): Decimal {
    if (totalBorrowShares.isZero()) {
      return new Decimal(1); // 1:1 when no shares exist
    }

    return totalBorrowAssets.div(totalBorrowShares);
  }

  /**
   * Calculate supply shares that can be redeemed for a given amount of assets
   * Used for withdrawals to determine exact shares to burn
   */
  static calculateSharesToBurn(
    requestedAssets: Decimal,
    totalSupplyAssets: Decimal,
    totalSupplyShares: Decimal
  ): Decimal {
    if (requestedAssets.isZero() || totalSupplyAssets.isZero()) {
      return new Decimal(0);
    }

    // shares = requestedAssets * totalShares / totalAssets
    return this.assetsToSupplyShares(requestedAssets, totalSupplyAssets, totalSupplyShares);
  }

  /**
   * Calculate borrow shares that need to be burned for a given repayment amount
   */
  static calculateBorrowSharesToBurn(
    repaymentAssets: Decimal,
    totalBorrowAssets: Decimal,
    totalBorrowShares: Decimal
  ): Decimal {
    if (repaymentAssets.isZero() || totalBorrowAssets.isZero()) {
      return new Decimal(0);
    }

    // shares = repaymentAssets * totalShares / totalAssets
    return this.assetsToBorrowShares(repaymentAssets, totalBorrowAssets, totalBorrowShares);
  }

  /**
   * Calculate the maximum assets that can be withdrawn given available shares
   */
  static calculateMaxWithdrawable(
    userSupplyShares: Decimal,
    totalSupplyAssets: Decimal,
    totalSupplyShares: Decimal,
    availableLiquidity: Decimal
  ): Decimal {
    if (userSupplyShares.isZero()) {
      return new Decimal(0);
    }

    // Calculate user's proportional assets
    const userAssets = this.supplySharesToAssets(
      userSupplyShares,
      totalSupplyAssets,
      totalSupplyShares
    );

    // Return minimum of user assets and available liquidity
    return Decimal.min(userAssets, availableLiquidity);
  }

  /**
   * Validate shares calculation is consistent
   * Used for testing and validation
   */
  static validateSharesConsistency(
    assets: Decimal,
    shares: Decimal,
    totalAssets: Decimal,
    totalShares: Decimal
  ): boolean {
    if (totalShares.isZero()) {
      return assets.eq(shares); 
    }

    const calculatedShares = this.assetsToSupplyShares(assets, totalAssets, totalShares);
    const calculatedAssets = this.supplySharesToAssets(shares, totalAssets, totalShares);

    const sharesMatch = shares.sub(calculatedShares).abs().lt('0.000001');
    const assetsMatch = assets.sub(calculatedAssets).abs().lt('0.000001');

    return sharesMatch && assetsMatch;
  }

  /**
   * Calculate shares to mint for a fee
   */
  static calculateFeeShares(
    feeAssets: Decimal,
    totalSupplyAssets: Decimal,
    totalSupplyShares: Decimal
  ): Decimal {
    return this.assetsToSupplyShares(feeAssets, totalSupplyAssets, totalSupplyShares);
  }

  /**
   * Calculate new total assets and shares after an operation
   */
  static simulateDeposit(
    depositAmount: Decimal,
    currentTotalAssets: Decimal,
    currentTotalShares: Decimal
  ): { newTotalAssets: Decimal; newTotalShares: Decimal; sharesMinted: Decimal } {
    const sharesMinted = this.assetsToSupplyShares(
      depositAmount,
      currentTotalAssets,
      currentTotalShares
    );

    return {
      newTotalAssets: currentTotalAssets.add(depositAmount),
      newTotalShares: currentTotalShares.add(sharesMinted),
      sharesMinted
    };
  }

  /**
   * Calculate new total assets and shares after a withdrawal
   */
  static simulateWithdraw(
    withdrawAmount: Decimal,
    currentTotalAssets: Decimal,
    currentTotalShares: Decimal
  ): { newTotalAssets: Decimal; newTotalShares: Decimal; sharesBurned: Decimal } {
    const sharesBurned = this.calculateSharesToBurn(
      withdrawAmount,
      currentTotalAssets,
      currentTotalShares
    );

    return {
      newTotalAssets: currentTotalAssets.sub(withdrawAmount),
      newTotalShares: currentTotalShares.sub(sharesBurned),
      sharesBurned
    };
  }
}