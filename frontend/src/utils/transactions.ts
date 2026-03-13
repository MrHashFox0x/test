import { ApiPromise, WsProvider } from '@polkadot/api';
import { getWallets } from '@talismn/connect-wallets';
import Decimal from 'decimal.js';

const PROTOCOL_COLDKEY = import.meta.env.VITE_PROTOCOL_COLDKEY || '5FU5GpAXJvDn8bD3MVU1eg4yzpyyFuyVHToFPmvnt8txWddA';
const PROTOCOL_HOTKEY = import.meta.env.VITE_PROTOCOL_HOTKEY || '5E4hBXkG9uVc1y9zdNzgCiLHrPbFukChkYeN1LxFnZgg4ASL';
const PROTOCOL_REMARK_TAG = import.meta.env.VITE_PROTOCOL_REMARK_TAG || 'MRH007';
const BITTENSOR_ENDPOINT = import.meta.env.VITE_BITTENSOR_ENDPOINT || 'wss://entrypoint-finney.opentensor.ai:443';

export enum UserActionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAW = 'WITHDRAW',
  BORROW = 'BORROW',
  REPAY = 'REPAY',
  DEPOSIT_COLLATERAL = 'DEPOSIT_COLLATERAL',
  WITHDRAW_COLLATERAL = 'WITHDRAW_COLLATERAL'
}

interface DepositUserRemark {
  type: 'USER_ACTION';
  action: UserActionType.DEPOSIT;
  userColdkey: string;
  timestamp: number;
  amountTao: string;
}

interface DepositCollateralUserRemark {
  type: 'USER_ACTION';
  action: UserActionType.DEPOSIT_COLLATERAL;
  userColdkey: string;
  timestamp: number;
  amountAlpha: string;
  linkedTxHash: string;
}

interface BorrowUserRemark {
  type: 'USER_ACTION';
  action: UserActionType.BORROW;
  userColdkey: string;
  timestamp: number;
  amountTao: string;
  currentCollateralAlpha: string;
}

interface RepayUserRemark {
  type: 'USER_ACTION';
  action: UserActionType.REPAY;
  userColdkey: string;
  timestamp: number;
  amountTao: string;
  linkedTxHash: string;
}

interface WithdrawCollateralUserRemark {
  type: 'USER_ACTION';
  action: UserActionType.WITHDRAW_COLLATERAL;
  userColdkey: string;
  timestamp: number;
  amountAlpha: string;
  remainingCollateralAlpha: string;
}

/**
 * Connect to Bittensor network
 */
export async function connectToNetwork(): Promise<ApiPromise> {
  const provider = new WsProvider(BITTENSOR_ENDPOINT);
  const api = await ApiPromise.create({ provider });
  await api.isReady;
  return api;
}

/**
 * Execute deposit transaction (TAO transfer + remark in batch)
 */
export async function executeDeposit(
  userAddress: string,
  amountTao: string,
  onStatusUpdate?: (status: string) => void
): Promise<string> {
  try {
    onStatusUpdate?.('Connecting to network...');
    const api = await connectToNetwork();

    onStatusUpdate?.('Preparing transaction...');

    // Convert TAO to Rao (1 TAO = 1e9 Rao)
    const amountRao = new Decimal(amountTao).mul(1e9).floor().toFixed(0);

    // Create transfer transaction
    const transferTx = api.tx.balances.transferKeepAlive(PROTOCOL_COLDKEY, amountRao);

    // Create remark transaction
    const depositRemark: DepositUserRemark = {
      type: 'USER_ACTION',
      action: UserActionType.DEPOSIT,
      userColdkey: userAddress,
      timestamp: Date.now(),
      amountTao: amountTao
    };

    const remarkMessage = `${PROTOCOL_REMARK_TAG}:${JSON.stringify(depositRemark)}`;
    const remarkTx = api.tx.system.remark(remarkMessage);

    // Batch both transactions
    const batchTx = api.tx.utility.batchAll([transferTx, remarkTx]);

    onStatusUpdate?.('Waiting for wallet signature...');

    // Get Talisman wallet
    const wallets = getWallets();
    const talismanWallet = wallets.find(w => w.extensionName === 'talisman' && w.installed);

    if (!talismanWallet) {
      throw new Error('Talisman wallet not found');
    }

    await talismanWallet.enable('MentatLend');
    const signer = talismanWallet.signer;

    return new Promise<string>((resolve, reject) => {
      batchTx
        .signAndSend(userAddress, { signer }, ({ status, txHash }) => {
          if (status.isInBlock) {
            onStatusUpdate?.('Transaction in block...');
            console.log(`✓ Deposit transaction in block: ${txHash.toHex()}`);
          } else if (status.isFinalized) {
            onStatusUpdate?.('Transaction finalized!');
            console.log(`✓ Deposit transaction finalized: ${txHash.toHex()}`);

            api.disconnect();
            resolve(txHash.toHex());
          }
        })
        .catch((error) => {
          console.error('Transaction error:', error);
          api.disconnect();
          reject(error);
        });
    });

  } catch (error: any) {
    console.error('Deposit execution error:', error);
    throw new Error(error.message || 'Failed to execute deposit');
  }
}

/**
 * Execute withdraw transaction (only writes remark - protocol sends TAO)
 */
export async function executeWithdraw(
  userAddress: string,
  amountTao: string,
  onStatusUpdate?: (status: string) => void
): Promise<string> {
  try {
    onStatusUpdate?.('Connecting to network...');
    const api = await connectToNetwork();

    onStatusUpdate?.('Preparing withdraw remark...');

    // Create withdraw remark
    const withdrawRemark = {
      type: 'USER_ACTION',
      action: UserActionType.WITHDRAW,
      userColdkey: userAddress,
      timestamp: Date.now(),
      amountTao: amountTao
    };

    const remarkMessage = `${PROTOCOL_REMARK_TAG}:${JSON.stringify(withdrawRemark)}`;
    const remarkTx = api.tx.system.remark(remarkMessage);

    onStatusUpdate?.('Waiting for wallet signature...');

    // Get Talisman wallet
    const wallets = getWallets();
    const talismanWallet = wallets.find(w => w.extensionName === 'talisman' && w.installed);

    if (!talismanWallet) {
      throw new Error('Talisman wallet not found');
    }

    await talismanWallet.enable('MentatLend');
    const signer = talismanWallet.signer;

    return new Promise<string>((resolve, reject) => {
      remarkTx
        .signAndSend(userAddress, { signer }, ({ status, txHash }) => {
          if (status.isInBlock) {
            onStatusUpdate?.('Remark in block...');
            console.log(`✓ Withdraw remark in block: ${txHash.toHex()}`);
          } else if (status.isFinalized) {
            onStatusUpdate?.('Transaction finalized!');
            console.log(`✓ Withdraw remark finalized: ${txHash.toHex()}`);
            api.disconnect();
            resolve(txHash.toHex());
          }
        })
        .catch((error) => {
          console.error('Withdraw remark error:', error);
          api.disconnect();
          reject(error);
        });
    });

  } catch (error: any) {
    console.error('Withdraw execution error:', error);
    throw new Error(error.message || 'Failed to execute withdraw');
  }
}

/**
 * Pre-validate borrow operation to check if health factor will be safe
 */
export async function validateBorrowHealthFactor(
  collateralAlpha: string,
  borrowAmountTao: string,
  alphaPriceTao: number,
  ltv: number = 0.5,
  lltv: number = 0.75
): Promise<{
  isValid: boolean;
  healthFactor: number;
  maxBorrowable: number;
  errors: string[];
}> {
  const errors: string[] = [];

  try {
    const collateral = parseFloat(collateralAlpha);
    const borrowAmount = parseFloat(borrowAmountTao);

    if (collateral <= 0) {
      errors.push('Collateral amount must be positive');
      return { isValid: false, healthFactor: 0, maxBorrowable: 0, errors };
    }

    if (borrowAmount <= 0) {
      errors.push('Borrow amount must be positive');
      return { isValid: false, healthFactor: 0, maxBorrowable: 0, errors };
    }

    // Calculate collateral value in TAO
    const collateralValueTao = collateral * alphaPriceTao;

    // Calculate max borrowable at LTV
    const maxBorrowable = collateralValueTao * ltv;

    // Check if borrow exceeds max borrowable
    if (borrowAmount > maxBorrowable) {
      errors.push(`Borrow amount (${borrowAmount.toFixed(2)} TAO) exceeds maximum borrowable (${maxBorrowable.toFixed(2)} TAO at ${ltv * 100}% LTV)`);
    }

    // Calculate health factor: (collateralValue * LLTV) / debt
    // Health factor must be >= 1.0 to avoid liquidation
    const healthFactor = (collateralValueTao * lltv) / borrowAmount;

    if (healthFactor < 1.0) {
      errors.push(`Health factor too low (${healthFactor.toFixed(4)}). Position would be liquidatable immediately.`);
    } else if (healthFactor < 1.2) {
      errors.push(`Warning: Health factor is low (${healthFactor.toFixed(4)}). Position may be at risk of liquidation.`);
    }

    return {
      isValid: errors.length === 0,
      healthFactor,
      maxBorrowable,
      errors
    };

  } catch (error: any) {
    errors.push(`Validation error: ${error.message}`);
    return { isValid: false, healthFactor: 0, maxBorrowable: 0, errors };
  }
}

/**
 * Execute deposit collateral + borrow in a single batch transaction
 * This ensures atomic operation: either both succeed or both fail
 */
export async function executeDepositAndBorrow(
  userAddress: string,
  amountAlpha: string,
  amountTaoBorrow: string,
  subnetId: string,
  alphaPriceTao: number,
  ltv: number = 0.5,
  lltv: number = 0.75,
  onStatusUpdate?: (status: string) => void
): Promise<string> {
  try {
    // Step 1: Pre-validate health factor
    onStatusUpdate?.('Validating borrow parameters...');
    const validation = await validateBorrowHealthFactor(
      amountAlpha,
      amountTaoBorrow,
      alphaPriceTao,
      ltv,
      lltv
    );

    if (!validation.isValid) {
      const errorMessage = validation.errors.join('\n');
      throw new Error(`Pre-validation failed:\n${errorMessage}`);
    }

    console.log(`✓ Pre-validation passed (Health Factor: ${validation.healthFactor.toFixed(4)})`);

    // Step 2: Connect to network
    onStatusUpdate?.('Connecting to network...');
    const api = await connectToNetwork();

    onStatusUpdate?.('Preparing batch transaction...');

    // Convert ALPHA to raw units (1 ALPHA = 1e9)
    const amountAlphaRaw = new Decimal(amountAlpha).mul(1e9).floor().toFixed(0);

    // Transaction 1: Transfer ALPHA as collateral (stake transfer)
    // transferStake(destinationColdkey, hotkey, originNetuid, destinationNetuid, amount)
    const transferStakeTx = api.tx.subtensorModule.transferStake(
      PROTOCOL_COLDKEY, // destination coldkey (protocol)
      PROTOCOL_HOTKEY, // hotkey
      subnetId, // origin netuid
      subnetId, // destination netuid (same subnet)
      amountAlphaRaw // amount
    );

    // Transaction 2: DEPOSIT_COLLATERAL remark
    const depositCollateralRemark: DepositCollateralUserRemark = {
      type: 'USER_ACTION',
      action: UserActionType.DEPOSIT_COLLATERAL,
      userColdkey: userAddress,
      timestamp: Date.now(),
      amountAlpha: amountAlpha,
      linkedTxHash: '' // Empty for batched transaction
    };

    const depositRemarkMessage = `${PROTOCOL_REMARK_TAG}:${JSON.stringify(depositCollateralRemark)}`;
    const depositRemarkTx = api.tx.system.remark(depositRemarkMessage);

    // Transaction 3: BORROW remark
    const borrowRemark: BorrowUserRemark = {
      type: 'USER_ACTION',
      action: UserActionType.BORROW,
      userColdkey: userAddress,
      timestamp: Date.now(),
      amountTao: amountTaoBorrow,
      currentCollateralAlpha: amountAlpha
    };

    const borrowRemarkMessage = `${PROTOCOL_REMARK_TAG}:${JSON.stringify(borrowRemark)}`;
    const borrowRemarkTx = api.tx.system.remark(borrowRemarkMessage);

    // Batch all three operations
    const batchTx = api.tx.utility.batchAll([
      transferStakeTx,
      depositRemarkTx,
      borrowRemarkTx
    ]);

    onStatusUpdate?.('Waiting for wallet signature...');

    // Get Talisman wallet
    const wallets = getWallets();
    const talismanWallet = wallets.find(w => w.extensionName === 'talisman' && w.installed);

    if (!talismanWallet) {
      throw new Error('Talisman wallet not found');
    }

    await talismanWallet.enable('MentatLend');
    const signer = talismanWallet.signer;

    return new Promise<string>((resolve, reject) => {
      batchTx
        .signAndSend(userAddress, { signer }, ({ status, txHash }) => {
          if (status.isInBlock) {
            onStatusUpdate?.('Transaction in block...');
            console.log(`✓ Batch transaction in block: ${txHash.toHex()}`);
          } else if (status.isFinalized) {
            onStatusUpdate?.('Transaction finalized! Protocol will send TAO shortly.');
            console.log(`✓ Batch transaction finalized: ${txHash.toHex()}`);
            console.log(`  - Collateral deposited: ${amountAlpha} ALPHA`);
            console.log(`  - Borrow requested: ${amountTaoBorrow} TAO`);
            console.log(`  - Health Factor: ${validation.healthFactor.toFixed(4)}`);

            api.disconnect();
            resolve(txHash.toHex());
          }
        })
        .catch((error) => {
          console.error('Batch transaction error:', error);
          api.disconnect();
          reject(error);
        });
    });

  } catch (error: any) {
    console.error('Deposit and borrow execution error:', error);
    throw new Error(error.message || 'Failed to execute deposit and borrow');
  }
}

/**
 * Execute repay transaction (TAO transfer to protocol + REPAY remark in batch)
 */
export async function executeRepay(
  userAddress: string,
  amountTao: string,
  onStatusUpdate?: (status: string) => void
): Promise<string> {
  try {
    onStatusUpdate?.('Connecting to network...');
    const api = await connectToNetwork();

    onStatusUpdate?.('Preparing repay transaction...');

    // Convert TAO to Rao (1 TAO = 1e9 Rao)
    const amountRao = new Decimal(amountTao).mul(1e9).floor().toFixed(0);

    // Transfer TAO back to protocol coldkey
    const transferTx = api.tx.balances.transferKeepAlive(PROTOCOL_COLDKEY, amountRao);

    // REPAY remark
    const repayRemark = {
      type: 'USER_ACTION',
      action: UserActionType.REPAY,
      userColdkey: userAddress,
      timestamp: Date.now(),
      amountTao: amountTao,
      linkedTxHash: '' // Filled by batch tx hash
    };

    const remarkMessage = `${PROTOCOL_REMARK_TAG}:${JSON.stringify(repayRemark)}`;
    const remarkTx = api.tx.system.remark(remarkMessage);

    // Batch transfer + remark
    const batchTx = api.tx.utility.batchAll([transferTx, remarkTx]);

    onStatusUpdate?.('Waiting for wallet signature...');

    // Get Talisman wallet
    const wallets = getWallets();
    const talismanWallet = wallets.find(w => w.extensionName === 'talisman' && w.installed);

    if (!talismanWallet) {
      throw new Error('Talisman wallet not found');
    }

    await talismanWallet.enable('MentatLend');
    const signer = talismanWallet.signer;

    return new Promise<string>((resolve, reject) => {
      batchTx
        .signAndSend(userAddress, { signer }, ({ status, txHash }) => {
          if (status.isInBlock) {
            onStatusUpdate?.('Transaction in block...');
            console.log(`✓ Repay transaction in block: ${txHash.toHex()}`);
          } else if (status.isFinalized) {
            onStatusUpdate?.('Transaction finalized!');
            console.log(`✓ Repay transaction finalized: ${txHash.toHex()}`);
            api.disconnect();
            resolve(txHash.toHex());
          }
        })
        .catch((error) => {
          console.error('Repay transaction error:', error);
          api.disconnect();
          reject(error);
        });
    });

  } catch (error: any) {
    console.error('Repay execution error:', error);
    throw new Error(error.message || 'Failed to execute repay');
  }
}

/**
 * Execute repay + withdraw collateral in a single batch transaction
 * User repays TAO debt and withdraws ALPHA collateral atomically
 */
export async function executeRepayAndWithdrawCollateral(
  userAddress: string,
  amountTaoRepay: string,
  amountAlphaWithdraw: string,
  currentCollateralAlpha: string,
  onStatusUpdate?: (status: string) => void
): Promise<string> {
  try {
    onStatusUpdate?.('Connecting to network...');
    const api = await connectToNetwork();

    onStatusUpdate?.('Preparing batch transaction...');

    // Convert TAO to Rao (1 TAO = 1e9 Rao)
    const amountRao = new Decimal(amountTaoRepay).mul(1e9).floor().toFixed(0);

    // Transaction 1: Transfer TAO to protocol (repayment)
    const transferTx = api.tx.balances.transferKeepAlive(PROTOCOL_COLDKEY, amountRao);

    // Transaction 2: REPAY remark
    const repayRemark: RepayUserRemark = {
      type: 'USER_ACTION',
      action: UserActionType.REPAY,
      userColdkey: userAddress,
      timestamp: Date.now(),
      amountTao: amountTaoRepay,
      linkedTxHash: ''
    };

    const repayRemarkMessage = `${PROTOCOL_REMARK_TAG}:${JSON.stringify(repayRemark)}`;
    const repayRemarkTx = api.tx.system.remark(repayRemarkMessage);

    // Transaction 3: WITHDRAW_COLLATERAL remark
    const remainingCollateral = new Decimal(currentCollateralAlpha)
      .minus(amountAlphaWithdraw)
      .toFixed();

    const withdrawCollateralRemark: WithdrawCollateralUserRemark = {
      type: 'USER_ACTION',
      action: UserActionType.WITHDRAW_COLLATERAL,
      userColdkey: userAddress,
      timestamp: Date.now(),
      amountAlpha: amountAlphaWithdraw,
      remainingCollateralAlpha: remainingCollateral
    };

    const withdrawRemarkMessage = `${PROTOCOL_REMARK_TAG}:${JSON.stringify(withdrawCollateralRemark)}`;
    const withdrawRemarkTx = api.tx.system.remark(withdrawRemarkMessage);

    // Batch all three operations
    const batchTx = api.tx.utility.batchAll([transferTx, repayRemarkTx, withdrawRemarkTx]);

    onStatusUpdate?.('Waiting for wallet signature...');

    // Get Talisman wallet
    const wallets = getWallets();
    const talismanWallet = wallets.find(w => w.extensionName === 'talisman' && w.installed);

    if (!talismanWallet) {
      throw new Error('Talisman wallet not found');
    }

    await talismanWallet.enable('MentatLend');
    const signer = talismanWallet.signer;

    return new Promise<string>((resolve, reject) => {
      batchTx
        .signAndSend(userAddress, { signer }, ({ status, txHash }) => {
          if (status.isInBlock) {
            onStatusUpdate?.('Transaction in block...');
            console.log(`✓ Repay + Withdraw Collateral batch in block: ${txHash.toHex()}`);
          } else if (status.isFinalized) {
            onStatusUpdate?.('Transaction finalized!');
            console.log(`✓ Repay + Withdraw Collateral batch finalized: ${txHash.toHex()}`);
            console.log(`  - Repaid: ${amountTaoRepay} TAO`);
            console.log(`  - Withdrawing: ${amountAlphaWithdraw} ALPHA`);
            console.log(`  - Remaining collateral: ${remainingCollateral} ALPHA`);
            api.disconnect();
            resolve(txHash.toHex());
          }
        })
        .catch((error) => {
          console.error('Repay + Withdraw Collateral batch error:', error);
          api.disconnect();
          reject(error);
        });
    });

  } catch (error: any) {
    console.error('Repay and withdraw collateral execution error:', error);
    throw new Error(error.message || 'Failed to execute repay and withdraw collateral');
  }
}
