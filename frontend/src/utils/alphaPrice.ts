import { ApiPromise, WsProvider } from '@polkadot/api';

const BITTENSOR_ENDPOINT = import.meta.env.VITE_BITTENSOR_ENDPOINT || 'wss://entrypoint-finney.opentensor.ai:443';
const SUBNET_ID = parseInt(import.meta.env.VITE_SUBNET_ID || '44');

/**
 * Convert u64f64 format to number
 */
function u64f64ToNumber(bits: string): number {
  const value = BigInt(bits);
  const integer = Number(value >> 64n);
  const fractional = Number(value & 0xFFFFFFFFFFFFFFFFn) / Number(0xFFFFFFFFFFFFFFFFn);
  return integer + fractional;
}

/**
 * Fetch Alpha price from blockchain
 * Returns price of 1 Alpha in TAO
 */
export async function fetchAlphaPrice(): Promise<number> {
  try {
    const provider = new WsProvider(BITTENSOR_ENDPOINT);
    const api = await ApiPromise.create({ provider });
    await api.isReady;

    // Get alpha sqrt price from swap module
    const alphaSqrtPrice = await api.query.swap.alphaSqrtPrice(SUBNET_ID);
    const sqrtPrice = u64f64ToNumber((alphaSqrtPrice.toJSON() as { bits: string }).bits);

    // Square it to get actual price
    const alphaPrice = sqrtPrice * sqrtPrice;

    await api.disconnect();

    console.log(`Alpha price fetched: ${alphaPrice} TAO`);
    return alphaPrice;

  } catch (error) {
    console.error('Failed to fetch Alpha price:', error);
    // Fallback to a default price if fetch fails
    return 0.05; // Default: 1 Alpha = 0.05 TAO
  }
}

/**
 * Calculate max borrow amount based on collateral
 * @param collateralAlpha - Amount of Alpha collateral
 * @param alphaPrice - Price of 1 Alpha in TAO
 * @param ltv - Loan-to-value ratio (default 0.5 = 50%)
 * @returns Maximum TAO that can be borrowed
 */
export function calculateMaxBorrow(
  collateralAlpha: number,
  alphaPrice: number,
  ltv: number = 0.5
): number {
  const collateralValueTao = collateralAlpha * alphaPrice;
  return collateralValueTao * ltv;
}

/**
 * Calculate health factor
 * @param collateralAlpha - Amount of Alpha collateral
 * @param borrowedTao - Amount of TAO borrowed
 * @param alphaPrice - Price of 1 Alpha in TAO
 * @param lltv - Liquidation LTV (default 0.75 = 75%)
 * @returns Health factor (> 1 is healthy, < 1 can be liquidated)
 */
export function calculateHealthFactor(
  collateralAlpha: number,
  borrowedTao: number,
  alphaPrice: number,
  lltv: number = 0.75
): number {
  if (borrowedTao === 0) return Infinity;

  const collateralValueTao = collateralAlpha * alphaPrice;
  const maxBorrowAtLiquidation = collateralValueTao * lltv;

  return maxBorrowAtLiquidation / borrowedTao;
}
