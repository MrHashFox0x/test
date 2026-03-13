import { useState, useEffect, useCallback } from 'react';
import { ApiPromise, WsProvider } from '@polkadot/api';

const BITTENSOR_ENDPOINT = import.meta.env.VITE_BITTENSOR_ENDPOINT || 'wss://entrypoint-finney.opentensor.ai:443';

export function useTaoBalance(address: string | undefined) {
  const [balance, setBalance] = useState<number>(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchBalance = useCallback(async () => {
    if (!address) {
      setBalance(0);
      return;
    }

    setIsLoading(true);
    try {
      const provider = new WsProvider(BITTENSOR_ENDPOINT);
      const api = await ApiPromise.create({ provider });
      const accountInfo = await api.query.system.account(address);
      const free = (accountInfo as any).data.free.toBigInt();
      // TAO has 9 decimals
      const taoBalance = Number(free) / 1e9;
      setBalance(taoBalance);
      await api.disconnect();
    } catch (err) {
      console.error('Failed to fetch TAO balance:', err);
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  useEffect(() => {
    fetchBalance();
    // Refresh every 30s
    const interval = setInterval(fetchBalance, 30000);
    return () => clearInterval(interval);
  }, [fetchBalance]);

  return { balance, isLoading, refetch: fetchBalance };
}
