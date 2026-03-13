import Decimal from 'decimal.js';
import type { ApiPromise } from '@polkadot/api';

// Subnet Data Types
export type SubnetDataRecord = Record<number, number>;

export type SubnetAlphaData = {
    netuid: number;
    alphaIn: number;
    taoIn: number;
    alphaPrice: number;
};

export type Validator = {
  netuid: number;
  hotkey: string;
  validatorName: string;
};

// TWAP Types
export interface TWAPConfig {
  windowSize: number; // Time window in seconds for TWAP calculation
  samplingInterval: number; // Sampling interval in seconds
  maxSamples?: number; // Maximum number of samples to store
}

export interface PriceSample {
  timestamp: number;
  price: number;
  blockNumber?: number;
}

// IRM Types
export interface IRMParams {
  optimalUtilizationRate: Decimal;
  baseRate: Decimal;
  slope1: Decimal;
  slope2: Decimal;
}

export interface AdaptiveIRMParams {
  targetUtilization: Decimal;
  adjustmentSpeed: Decimal;
  curveSteepness: Decimal;
  initialRateAtTarget: Decimal;
  minRateAtTarget: Decimal;
  maxRateAtTarget: Decimal;
}

export interface AdaptiveState {
  rateAtTarget: Decimal;
  lastUpdateTimestamp: number;
}

export interface IRMRates {
  borrowRate: Decimal;
  supplyRate: Decimal;
  utilizationRate: Decimal;
}

// Market State Types
export interface MarketState {
  marketId: string;
  totalSupplyAssets: Decimal;
  totalSupplyShares: Decimal;
  totalBorrowAssets: Decimal;
  totalBorrowShares: Decimal;
  lastUpdateTimestamp: number;
  totalReserves: Decimal;
  protocolFee: Decimal;
  protocolFeeShares: Decimal; // Accumulated protocol fee shares (not assigned to any user)
  isActive: boolean;
  ltv: Decimal; // Loan-to-Value ratio - max borrow threshold (50%)
  lltv: Decimal; // Liquidation Loan-to-Value ratio - liquidation threshold (75%)

  // Root Staking
  totalStakedOnRoot: Decimal; // Total TAO staked on Root network (netuid 0)

  // IRM Configuration
  irmParams: IRMParams;
  adaptiveIrmParams: AdaptiveIRMParams;
  adaptiveState: AdaptiveState;
}

// Interest Calculations Types
export interface AccrualResult {
  interestAccrued: Decimal;
  borrowRate: Decimal;
  supplyRate: Decimal;
  utilizationRate: Decimal;
  feeShares: Decimal;
}

// Deposit Action Types
export interface DepositParams {
  coldkey: string;
  marketId: string;
  amountTao: Decimal;
  currentTimestamp?: number;
}

export interface DepositResult {
  success: boolean;
  sharesMinted: Decimal;
  newBalance: Decimal;
  exchangeRate: Decimal;
  marketState: MarketState;
  accrualResult?: AccrualResult;
  txHash?: string;
  blockNumber?: bigint;
}

// Withdraw Action Types
export interface WithdrawParams {
  coldkey: string;
  marketId: string;
  amountTao: Decimal;
  currentTimestamp?: number;
}

export interface WithdrawResult {
  success: boolean;
  sharesBurned: Decimal;
  amountWithdrawn: Decimal;
  remainingBalance: Decimal;
  exchangeRate: Decimal;
  marketState: MarketState;
  accrualResult?: AccrualResult;
  txHash?: string;
  blockNumber?: bigint;
}

// Deposit Collateral Action Types
export interface DepositCollateralParams {
  coldkey: string;
  marketId: string;
  amountAlpha: Decimal;
  currentTimestamp?: number;
}

export interface DepositCollateralResult {
  success: boolean;
  amountDeposited: Decimal;
  newCollateralBalance: Decimal;
  marketState: MarketState;
  accrualResult?: AccrualResult;
  txHash?: string;
  blockNumber?: bigint;
}

// Borrow Action Types
export interface BorrowParams {
  coldkey: string;
  marketId: string;
  amountTao: Decimal;
  archiveApi: ApiPromise;
  twapConfig?: TWAPConfig;
  currentTimestamp?: number;
}

export interface BorrowResult {
  success: boolean;
  sharesMinted: Decimal;
  amountBorrowed: Decimal;
  newDebt: Decimal;
  healthFactor: Decimal;
  healthMetrics: BorrowerMetrics;
  marketState: MarketState;
  accrualResult?: AccrualResult;
  txHash?: string;
  blockNumber?: bigint;
}

// Repay Action Types
export interface RepayParams {
  coldkey: string;
  marketId: string;
  amountTao: Decimal;
  currentTimestamp?: number;
}

export interface RepayResult {
  success: boolean;
  sharesBurned: Decimal;
  amountRepaid: Decimal;
  remainingDebt: Decimal;
  marketState: MarketState;
  accrualResult?: AccrualResult;
  txHash?: string;
  blockNumber?: bigint;
}

// Withdraw Collateral Action Types
export interface WithdrawCollateralParams {
  coldkey: string;
  marketId: string;
  amountAlpha: Decimal;
  archiveApi: ApiPromise;
  twapConfig?: TWAPConfig;
  currentTimestamp?: number;
}

export interface WithdrawCollateralResult {
  success: boolean;
  amountWithdrawn: Decimal;
  remainingCollateral: Decimal;
  healthFactor?: Decimal;
  healthMetrics?: BorrowerMetrics;
  marketState: MarketState;
  accrualResult?: AccrualResult;
  txHash?: string;
  blockNumber?: bigint;
}

// Liquidation Action Types
export interface LiquidationParams {
  liquidatorColdkey: string;
  borrowerColdkey: string;
  marketId: string;
  repayAmountTao: Decimal;
  archiveApi: ApiPromise;
  twapConfig?: TWAPConfig;
  currentTimestamp?: number;
}

export interface LiquidationResult {
  success: boolean;
  debtRepaid: Decimal;
  collateralSeized: Decimal;
  bonusReceived: Decimal;
  sharesBurned: Decimal;
  newHealthFactor?: Decimal;
  healthMetrics?: BorrowerMetrics;
  marketState: MarketState;
  accrualResult?: AccrualResult;
  hasBadDebt: boolean;
  txHashes?: string[]; // [repayTxHash, seizeTxHash]
  blockNumber?: bigint;
}

export interface LiquidatablePosition {
  borrowerColdkey: string;
  borrowedTao: Decimal;
  collateralAlpha: Decimal;
  collateralValueTao: Decimal;
  healthFactor: Decimal;
  ltv: Decimal;
  maxLiquidatable: Decimal;
}

// Borrower Health Metrics
export interface BorrowerMetrics {
  borrowedTao: Decimal;
  collateralValueTao: Decimal;
  ltv: Decimal;
  healthFactor: Decimal;
  liquidationPrice: Decimal;
  maxBorrowable: Decimal;
}

// Common action result interface
export interface ActionResult {
  success: boolean;
  txHash?: string;
  blockNumber?: number;
  timestamp?: number;
}

// User position interfaces
export interface LenderPosition {
  coldkey: string;
  marketId: string;
  supplyShares: string; // Decimal as string
  lastUpdateTimestamp: number;
}

export interface BorrowerPosition {
  coldkey: string;
  marketId: string;
  borrowShares: string; // Decimal as string
  collateralAlpha: string; // Decimal as string
  lastUpdateTimestamp: number;
}

// In-memory position state interfaces (using Decimal types)
export interface LenderPositionState {
  coldkey: string;
  marketId: string;
  supplyShares: Decimal;
  lastUpdateTimestamp: number;
}

export interface BorrowerPositionState {
  coldkey: string;
  marketId: string;
  borrowShares: Decimal;
  collateralAlpha: Decimal;
  lastUpdateTimestamp: number;
}

// Default Parameters - consolidated from both branches
export const DEFAULT_TWAP_CONFIG: TWAPConfig = {
  windowSize: 7200, // 2 hour window
  samplingInterval: 600, // Sample every 10 minutes
  maxSamples: 12, // Store up to 12 samples (2 hours with 10-minute intervals)
};

// ============================================
// REMARK SYSTEM TYPES
// ============================================

// User Action Types
export enum UserActionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  BORROW = 'BORROW',
  REPAY = 'REPAY',
  DEPOSIT_COLLATERAL = 'DEPOSIT_COLLATERAL',
  WITHDRAW_COLLATERAL = 'WITHDRAW_COLLATERAL'
}

// Protocol Action Types (for actions_in_progress)
export enum ProtocolActionType {
  WITHDRAW = 'WITHDRAW',
  BORROW = 'BORROW',
  WITHDRAW_COLLATERAL = 'WITHDRAW_COLLATERAL',
  LIQUIDATE = 'LIQUIDATE'
}

// User Position in STATE_OF_MARKET remark
export interface UserPositionSnapshot {
  supplyShares: string; // Decimal as string
  borrowShares: string; // Decimal as string
  collateralAlpha: string; // Decimal as string
}

// Market Totals in STATE_OF_MARKET remark
export interface MarketTotalsSnapshot {
  totalSupplyAssets: string; // Decimal as string
  totalSupplyShares: string; // Decimal as string
  totalBorrowAssets: string; // Decimal as string
  totalBorrowShares: string; // Decimal as string
  feeRecipientShares: string; // Decimal as string
}

// Interest Accrual in STATE_OF_MARKET remark
export interface InterestAccrualSnapshot {
  amountAccrued: string; // Decimal as string - TAO accrued
  feeSharesMinted: string; // Decimal as string - Fee shares minted
  borrowRateUsed: string; // Decimal as string - Annual borrow rate
  supplyRateUsed: string; // Decimal as string - Annual supply rate
  timeElapsedSeconds: number; // Time since last state update
  blocksElapsed: number; // Blocks since last state update
}

// Action in Progress in STATE_OF_MARKET remark
export interface ActionInProgress {
  action: ProtocolActionType;
  userColdkey: string; // Recipient/target user
  amountTao?: string; // Decimal as string - TAO amount (if applicable)
  amountAlpha?: string; // Decimal as string - ALPHA amount (if applicable)
  sharesMinted?: string; // Decimal as string - Shares being minted
  sharesBurned?: string; // Decimal as string - Shares being burned
  timestampInitiated: number; // When action was initiated
  txHash?: string; // Transaction hash if transaction sent
}

// STATE_OF_MARKET Remark Structure
export interface StateOfMarketRemark {
  type: 'STATE_OF_MARKET';
  stateNumber: number; // Sequential state counter
  timestamp: number; // Unix timestamp in milliseconds
  blockNumber?: number; // Block number where this remark is written

  // Complete market state
  marketTotals: MarketTotalsSnapshot;

  // Interest accrual since last state
  interestAccrual: InterestAccrualSnapshot;

  // All user positions (coldkey → position)
  userPositions: Record<string, UserPositionSnapshot>;

  // IRM configuration
  irmConfiguration?: {
    baseParams: {
      optimalUtilizationRate: string;
      baseRate: string;
      slope1: string;
      slope2: string;
    };
    adaptiveParams: {
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

  // Optional: Protocol action currently in progress
  actionInProgress?: ActionInProgress;
}

// USER Remark Structure - Base interface
export interface BaseUserRemark {
  type: 'USER_ACTION';
  action: UserActionType;
  userColdkey: string;
  timestamp: number; // Unix timestamp in milliseconds
  linkedTxHash?: string; // If user already sent transaction
}

// USER Remark - DEPOSIT
export interface DepositUserRemark extends BaseUserRemark {
  action: UserActionType.DEPOSIT;
  amountTao: string; // Decimal as string
  expectedShares?: string; // Decimal as string - Expected shares to receive
}

// USER Remark - WITHDRAW
export interface WithdrawUserRemark extends BaseUserRemark {
  action: UserActionType.WITHDRAW;
  amountTao: string; // Decimal as string
  sharesBurned?: string; // Decimal as string - Shares being burned
}

// USER Remark - BORROW
export interface BorrowUserRemark extends BaseUserRemark {
  action: UserActionType.BORROW;
  amountTao: string; // Decimal as string
  currentCollateralAlpha: string; // Decimal as string - Current collateral amount
  expectedShares?: string; // Decimal as string - Expected borrow shares
}

// USER Remark - REPAY
export interface RepayUserRemark extends BaseUserRemark {
  action: UserActionType.REPAY;
  amountTao: string; // Decimal as string
  sharesBurned?: string; // Decimal as string - Borrow shares being burned
  linkedTxHash: string; // Required - user sends repayment transaction
}

// USER Remark - DEPOSIT_COLLATERAL
export interface DepositCollateralUserRemark extends BaseUserRemark {
  action: UserActionType.DEPOSIT_COLLATERAL;
  amountAlpha: string; // Decimal as string
  linkedTxHash: string; // Required - user sends collateral transaction
}

// USER Remark - WITHDRAW_COLLATERAL
export interface WithdrawCollateralUserRemark extends BaseUserRemark {
  action: UserActionType.WITHDRAW_COLLATERAL;
  amountAlpha: string; // Decimal as string
  remainingCollateralAlpha: string; // Decimal as string - Collateral after withdrawal
}

// Union type for all USER remarks
export type UserRemark =
  | DepositUserRemark
  | WithdrawUserRemark
  | BorrowUserRemark
  | RepayUserRemark
  | DepositCollateralUserRemark
  | WithdrawCollateralUserRemark;

// Combined Remark type
export type BlockchainRemark = StateOfMarketRemark | UserRemark;

