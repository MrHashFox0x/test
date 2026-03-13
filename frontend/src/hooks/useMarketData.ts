import { useState, useEffect } from 'react';
import {
  calculateBorrowAPY,
  calculateSupplyAPY,
  calculateUtilizationRatePercent,
  calculateLiquidity,
  MarketStateData
} from '../utils/adaptiveIRM';
import { fetchProtocolState } from '../utils/fetchState';

export interface MarketMetrics {
  totalSupplyAssets: string;
  totalBorrowAssets: string;
  totalSupplyShares: string;
  totalBorrowShares: string;
  liquidity: string;
  utilizationRate: string;
  supplyAPY: string;
  borrowAPY: string;
  totalStakedOnRoot: string;
  totalReserves: string;
  lastUpdateTimestamp: number;
}

export interface MarketConfig {
  ltv: string;
  lltv: string;
  protocolFee: string;
  isActive: boolean;
}

export interface MarketData {
  marketId: string;
  blockNumber: number;
  timestamp: number;
  stateNumber: number;
  metrics: MarketMetrics;
  config: MarketConfig;
  irmState: {
    rateAtTarget: string;
    lastUpdateTimestamp: number;
  };
}

const REFRESH_INTERVAL = parseInt(import.meta.env.VITE_MARKET_DATA_REFRESH || '10000');

export function useMarketData() {
  const [data, setData] = useState<MarketData | null>(null);
  const [rawMarketState, setRawMarketState] = useState<MarketStateData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMarketData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const backup = await fetchProtocolState();

      // Get first market from marketStates (usually only one market)
      const marketId = Object.keys(backup.marketStates)[0];
      if (!marketId) {
        throw new Error('No market data found in backup');
      }

      const marketState = backup.marketStates[marketId];

      // Prepare data for APY / debt calculation
      const marketStateForCalc = {
        totalSupplyAssets: marketState.totalSupplyAssets,
        totalBorrowAssets: marketState.totalBorrowAssets,
        totalSupplyShares: marketState.totalSupplyShares,
        totalBorrowShares: marketState.totalBorrowShares,
        lastUpdateTimestamp: marketState.lastUpdateTimestamp,
        protocolFee: marketState.protocolFee,
        adaptiveIrmParams: marketState.adaptiveIrmParams,
        adaptiveState: marketState.adaptiveState
      };

      // Calculate current APYs using adaptive IRM
      const borrowAPY = calculateBorrowAPY(marketStateForCalc);
      const supplyAPY = calculateSupplyAPY(marketStateForCalc);
      const utilizationRate = calculateUtilizationRatePercent(marketStateForCalc);
      const liquidity = calculateLiquidity(marketStateForCalc);

      // Transform the scanner backup data to match our MarketData interface
      const marketData: MarketData = {
        marketId,
        blockNumber: backup.blockNumber,
        timestamp: backup.timestamp,
        stateNumber: backup.stateNumber,
        metrics: {
          totalSupplyAssets: marketState.totalSupplyAssets,
          totalBorrowAssets: marketState.totalBorrowAssets,
          totalSupplyShares: marketState.totalSupplyShares,
          totalBorrowShares: marketState.totalBorrowShares,
          liquidity: liquidity.toString(),
          utilizationRate: (utilizationRate / 100).toString(), // Convert to decimal
          supplyAPY: supplyAPY.toString(),
          borrowAPY: borrowAPY.toString(),
          totalStakedOnRoot: marketState.totalStakedOnRoot,
          totalReserves: marketState.totalReserves,
          lastUpdateTimestamp: marketState.lastUpdateTimestamp
        },
        config: {
          ltv: marketState.ltv,
          lltv: marketState.lltv,
          protocolFee: marketState.protocolFee,
          isActive: marketState.isActive
        },
        irmState: {
          rateAtTarget: marketState.adaptiveState.rateAtTarget,
          lastUpdateTimestamp: marketState.adaptiveState.lastUpdateTimestamp
        }
      };

      setData(marketData);
      setRawMarketState(marketStateForCalc);
    } catch (err: any) {
      console.error('Error fetching market data:', err);
      setError(err.message || 'Failed to fetch market data');
    } finally {
      setIsLoading(false);
    }
  };

  // Initial fetch and polling
  useEffect(() => {
    fetchMarketData();

    // Set up polling interval
    const intervalId = setInterval(fetchMarketData, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, []);

  return {
    data,
    rawMarketState,
    isLoading,
    error,
    refresh: fetchMarketData
  };
}
