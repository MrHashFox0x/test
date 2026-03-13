import { useState, useEffect } from 'react';
import { ApiPromise, WsProvider } from '@polkadot/api';

interface PolkadotApiState {
  api: ApiPromise | null;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
}

const BITTENSOR_ENDPOINT = import.meta.env.VITE_BITTENSOR_ENDPOINT || 'wss://entrypoint-finney.opentensor.ai:443';

export function usePolkadotApi() {
  const [state, setState] = useState<PolkadotApiState>({
    api: null,
    isConnected: false,
    isConnecting: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;
    let api: ApiPromise | null = null;

    const connect = async () => {
      try {
        setState(prev => ({ ...prev, isConnecting: true, error: null }));

        const provider = new WsProvider(BITTENSOR_ENDPOINT);
        api = await ApiPromise.create({ provider });

        if (!isMounted) {
          await api.disconnect();
          return;
        }

        setState({
          api,
          isConnected: true,
          isConnecting: false,
          error: null,
        });

        console.log('✅ Connected to Bittensor network');

      } catch (err: any) {
        console.error('Failed to connect to Bittensor:', err);
        if (isMounted) {
          setState({
            api: null,
            isConnected: false,
            isConnecting: false,
            error: err.message || 'Failed to connect to blockchain',
          });
        }
      }
    };

    connect();

    return () => {
      isMounted = false;
      if (api) {
        api.disconnect().catch(console.error);
      }
    };
  }, []);

  return state;
}
