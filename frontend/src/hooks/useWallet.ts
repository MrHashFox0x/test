import { useState, useRef } from 'react';
import { getWallets } from '@talismn/connect-wallets';

interface WalletAccount {
  address: string;
  name?: string;
  source?: string;
}

export function useWallet() {
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [accounts, setAccounts] = useState<WalletAccount[]>([]);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disconnectedRef = useRef(false);

  const connectWallet = async () => {
    setIsConnecting(true);
    setError(null);
    disconnectedRef.current = false;

    try {
      const installedWallets = getWallets().filter((wallet) => wallet.installed);

      if (installedWallets.length === 0) {
        throw new Error('No wallet extension found. Please install Talisman wallet.');
      }

      const talismanWallet = installedWallets.find(
        (wallet) => wallet.extensionName === 'talisman'
      );

      if (!talismanWallet) {
        throw new Error('Talisman wallet not found. Please install Talisman extension.');
      }

      await talismanWallet.enable('MentatLend');

      talismanWallet.subscribeAccounts((walletAccounts) => {
        if (disconnectedRef.current) return;

        if (walletAccounts && walletAccounts.length > 0) {
          const formattedAccounts = walletAccounts.map(acc => ({
            address: acc.address,
            name: acc.name,
            source: acc.source
          }));

          console.log('All wallet accounts received:', walletAccounts.length, walletAccounts.map(a => ({ address: a.address, name: a.name, type: (a as any).type })));
          setAccounts(formattedAccounts);
          setAccount(formattedAccounts[0]);
          console.log('Connected to Talisman wallet:', formattedAccounts[0].address);
        } else {
          throw new Error('No accounts found in Talisman wallet. Please create an account first.');
        }
      });

    } catch (err: any) {
      console.error('Failed to connect wallet:', err);
      setError(err.message || 'Failed to connect wallet');
    } finally {
      setIsConnecting(false);
    }
  };

  const disconnectWallet = () => {
    disconnectedRef.current = true;
    setAccount(null);
    setAccounts([]);
    setError(null);
  };

  const selectAccount = (address: string) => {
    const selectedAccount = accounts.find(acc => acc.address === address);
    if (selectedAccount) {
      setAccount(selectedAccount);
    }
  };

  return {
    account,
    accounts,
    isConnecting,
    error,
    isConnected: !!account,
    connectWallet,
    disconnectWallet,
    selectAccount,
  };
}
