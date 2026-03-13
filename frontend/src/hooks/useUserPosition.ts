import { useState, useEffect } from 'react';
import { fetchProtocolState } from '../utils/fetchState';

export interface UserPosition {
  coldkey: string;
  supplyShares: string;
  borrowShares: string;
  collateralAlpha: string;
  supplyAssets: string;
  borrowAssets: string;
}

const REFRESH_INTERVAL = parseInt(import.meta.env.VITE_MARKET_DATA_REFRESH || '10000');

export function useUserPosition(address: string | null | undefined) {
  const [position, setPosition] = useState<UserPosition | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUserPosition = async () => {
    if (!address) {
      setPosition(null);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const backup = await fetchProtocolState();

      // Extract user position from userPositions object
      const userPos = backup.userPositions?.[address];

      if (userPos) {
        // Get market state to calculate assets from shares
        const marketId = Object.keys(backup.marketStates)[0];
        const marketState = backup.marketStates[marketId];

        // Calculate supplyAssets and borrowAssets from shares
        // supplyAssets = supplyShares * (totalSupplyAssets / totalSupplyShares)
        // borrowAssets = borrowShares * (totalBorrowAssets / totalBorrowShares)

        const supplySharesNum = parseFloat(userPos.supplyShares);
        const borrowSharesNum = parseFloat(userPos.borrowShares);
        const totalSupplyShares = parseFloat(marketState.totalSupplyShares);
        const totalBorrowShares = parseFloat(marketState.totalBorrowShares);
        const totalSupplyAssets = parseFloat(marketState.totalSupplyAssets);
        const totalBorrowAssets = parseFloat(marketState.totalBorrowAssets);

        const DUST_THRESHOLD = 0.00001;
        let supplyAssets = '0';
        let borrowAssets = '0';

        if (totalSupplyShares > 0 && supplySharesNum > 0) {
          const val = (supplySharesNum / totalSupplyShares) * totalSupplyAssets;
          supplyAssets = val < DUST_THRESHOLD ? '0' : val.toString();
        }

        if (totalBorrowShares > 0 && borrowSharesNum > 0) {
          const val = (borrowSharesNum / totalBorrowShares) * totalBorrowAssets;
          borrowAssets = val < DUST_THRESHOLD ? '0' : val.toString();
        }

        const userPosition: UserPosition = {
          coldkey: address,
          supplyShares: userPos.supplyShares,
          borrowShares: userPos.borrowShares,
          collateralAlpha: userPos.collateralAlpha,
          supplyAssets,
          borrowAssets
        };
        setPosition(userPosition);
      } else {
        // User has no position yet
        setPosition({
          coldkey: address,
          supplyShares: '0',
          borrowShares: '0',
          collateralAlpha: '0',
          supplyAssets: '0',
          borrowAssets: '0'
        });
      }
    } catch (err: any) {
      console.error('Error fetching user position:', err);
      setError(err.message || 'Failed to fetch user position');
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch when address changes or on interval
  useEffect(() => {
    if (!address) {
      setPosition(null);
      return;
    }

    fetchUserPosition();

    // Set up polling interval
    const intervalId = setInterval(fetchUserPosition, REFRESH_INTERVAL);

    return () => clearInterval(intervalId);
  }, [address]);

  return {
    position,
    isLoading,
    error,
    refresh: fetchUserPosition
  };
}
