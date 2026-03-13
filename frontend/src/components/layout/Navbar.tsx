import { useEffect, useState, useRef } from 'react';
import mentatLogo from '../../assets/mentat-logo.svg';

interface NavbarProps {
  account: { address: string; name?: string } | null;
  accounts: { address: string; name?: string }[];
  isConnecting: boolean;
  isConnected: boolean;
  connectWallet: () => void;
  disconnectWallet: () => void;
  selectAccount: (address: string) => void;
  taoBalance: number;
}

const SUBNETS = [
  { id: 1, name: 'Subnet 1 — Prompting' },
  { id: 5, name: 'Subnet 5 — OpenKaito' },
  { id: 9, name: 'Subnet 9 — Pretrain' },
  { id: 18, name: 'Subnet 18 — Cortex.t' },
  { id: 44, name: 'Subnet 44 — Score' },
];

export function Navbar({ account, accounts, isConnecting, isConnected, connectWallet, disconnectWallet, selectAccount, taoBalance }: NavbarProps) {
  const [scrollY, setScrollY] = useState(0);
  const [marketsOpen, setMarketsOpen] = useState(false);
  const [accountsOpen, setAccountsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const accountDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setMarketsOpen(false);
      }
      if (accountDropdownRef.current && !accountDropdownRef.current.contains(e.target as Node)) {
        setAccountsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getWidth = () => {
    if (typeof window !== 'undefined') {
      const w = window.innerWidth;
      if (w >= 1024) return Math.max(780, 1060 - scrollY * 0.5);
      if (w >= 768) return Math.min(w - 64, 700);
      return Math.min(w - 32, 500);
    }
    return 1060;
  };

  return (
    <header style={{
      position: 'fixed',
      left: '50%',
      transform: 'translateX(-50%)',
      top: '14px',
      zIndex: 50,
      width: `${getWidth()}px`,
      minWidth: '500px',
      transition: 'width 0.3s ease',
    }}>
      <div className="glass-dark" style={{
        borderRadius: '9999px',
        padding: '10px 10px 10px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          <img src={mentatLogo} alt="MentatLend" width="40" height="40" />
          <span style={{
            fontFamily: 'Chillax Variable, Chillax',
            fontWeight: 700,
            fontSize: '20px',
            color: '#3B3BF9',
          }}>
            MentatLend
          </span>
        </div>

        {/* Right side: nav + connect */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Docs link */}
          <a href="https://www.notion.so/mentat-minds/Lending-Borrowing-on-Bittensor-by-Mentat-Minds-2fd11a348a4e8076a4a8fce7b4c660dd" target="_blank" rel="noopener noreferrer" style={{
            fontSize: '14px',
            fontWeight: 500,
            color: '#2D2D5E',
            textDecoration: 'none',
            padding: '8px 16px',
            borderRadius: '9999px',
            transition: 'background 0.2s',
          }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59,59,249,0.06)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            Docs
          </a>

          {/* Markets dropdown */}
          <div ref={dropdownRef} style={{ position: 'relative' }}>
            <button
              onClick={() => setMarketsOpen(!marketsOpen)}
              style={{
                fontSize: '14px',
                fontWeight: 600,
                color: '#fff',
                background: '#3B3BF9',
                border: 'none',
                borderRadius: '9999px',
                padding: '8px 20px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'background 0.2s, box-shadow 0.2s',
                boxShadow: '0 2px 8px rgba(59,59,249,0.25)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2D2DC7';
                e.currentTarget.style.boxShadow = '0 4px 14px rgba(59,59,249,0.35)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#3B3BF9';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(59,59,249,0.25)';
              }}
            >
              Markets
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{
                transform: marketsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: 'transform 0.2s',
              }}>
                <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {/* Dropdown */}
            {marketsOpen && (
              <div style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '240px',
                background: 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(20px)',
                border: '1.5px solid rgba(59,59,249,0.12)',
                borderRadius: '16px',
                boxShadow: '0 8px 32px rgba(59,59,249,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                padding: '8px',
                zIndex: 100,
              }}>
                {SUBNETS.map((subnet) => (
                  <button
                    key={subnet.id}
                    onClick={() => setMarketsOpen(false)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      width: '100%',
                      padding: '10px 14px',
                      border: 'none',
                      background: 'transparent',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#1A1A3E',
                      textAlign: 'left',
                      transition: 'background 0.15s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(59,59,249,0.06)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #EDE9FF 0%, #D6E2FF 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '11px',
                      fontWeight: 700,
                      color: '#3B3BF9',
                      flexShrink: 0,
                    }}>
                      {subnet.id}
                    </span>
                    {subnet.name}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Divider */}
          <div style={{ width: '1px', height: '24px', background: 'rgba(59,59,249,0.1)', margin: '0 4px' }} />

          {/* Connect / Account */}
          {isConnected ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              {/* Balance pill */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                background: '#F6F4FF',
                border: '1.5px solid rgba(59,59,249,0.1)',
                padding: '6px 14px',
                borderRadius: '9999px',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 700, color: '#3B3BF9' }}>
                  {taoBalance.toFixed(4)}
                </span>
                <span style={{ fontSize: '11px', fontWeight: 500, color: '#6B6B8D' }}>TAO</span>
              </div>
              {/* Address pill with account switcher */}
              <div ref={accountDropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setAccountsOpen(!accountsOpen)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    background: '#ecfdf5',
                    border: '1.5px solid #a7f3d0',
                    padding: '6px 14px',
                    borderRadius: '9999px',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  <div style={{
                    width: '7px', height: '7px',
                    background: '#059669', borderRadius: '50%',
                  }} />
                  <span style={{ fontSize: '13px', fontWeight: 500, color: '#065f46' }}>
                    {`${account?.address.slice(0, 6)}...${account?.address.slice(-4)}`}
                  </span>
                  {accounts.length > 1 && (
                    <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{
                      transform: accountsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                      transition: 'transform 0.2s',
                    }}>
                      <path d="M3 4.5L6 7.5L9 4.5" stroke="#065f46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>

                {accountsOpen && accounts.length > 1 && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 8px)',
                    right: 0,
                    width: '280px',
                    background: 'rgba(255,255,255,0.97)',
                    backdropFilter: 'blur(20px)',
                    border: '1.5px solid rgba(59,59,249,0.12)',
                    borderRadius: '16px',
                    boxShadow: '0 8px 32px rgba(59,59,249,0.12), 0 2px 8px rgba(0,0,0,0.06)',
                    padding: '8px',
                    zIndex: 100,
                  }}>
                    <div style={{ padding: '6px 14px 10px', fontSize: '11px', fontWeight: 600, color: '#9B9BB5', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Switch Account
                    </div>
                    {accounts.map((acc) => (
                      <button
                        key={acc.address}
                        onClick={() => {
                          selectAccount(acc.address);
                          setAccountsOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '10px',
                          width: '100%',
                          padding: '10px 14px',
                          border: 'none',
                          background: acc.address === account?.address ? 'rgba(5,150,105,0.08)' : 'transparent',
                          borderRadius: '10px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: 500,
                          color: '#1A1A3E',
                          textAlign: 'left',
                          transition: 'background 0.15s',
                        }}
                        onMouseEnter={(e) => {
                          if (acc.address !== account?.address) e.currentTarget.style.background = 'rgba(59,59,249,0.06)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = acc.address === account?.address ? 'rgba(5,150,105,0.08)' : 'transparent';
                        }}
                      >
                        <div style={{
                          width: '7px', height: '7px', borderRadius: '50%', flexShrink: 0,
                          background: acc.address === account?.address ? '#059669' : '#9B9BB5',
                        }} />
                        <div>
                          {acc.name && <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '2px' }}>{acc.name}</div>}
                          <div style={{ fontSize: '12px', color: '#6B6B8D', fontFamily: 'monospace' }}>
                            {`${acc.address.slice(0, 8)}...${acc.address.slice(-6)}`}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={disconnectWallet}
                style={{
                  fontSize: '13px',
                  fontWeight: 500,
                  color: '#6B6B8D',
                  background: 'transparent',
                  border: '1.5px solid rgba(59,59,249,0.12)',
                  borderRadius: '9999px',
                  padding: '6px 14px',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(59,59,249,0.3)';
                  e.currentTarget.style.color = '#1A1A3E';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'rgba(59,59,249,0.12)';
                  e.currentTarget.style.color = '#6B6B8D';
                }}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontSize: '14px',
                fontWeight: 500,
                color: '#2D2D5E',
                background: 'transparent',
                border: '1.5px solid rgba(59,59,249,0.15)',
                borderRadius: '9999px',
                padding: '8px 20px',
                cursor: 'pointer',
                transition: 'all 0.2s',
                opacity: isConnecting ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59,59,249,0.35)';
                e.currentTarget.style.background = 'rgba(59,59,249,0.04)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(59,59,249,0.15)';
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="4" width="12" height="9" rx="2" stroke="#3B3BF9" strokeWidth="1.5" />
                <path d="M4 4V3.5C4 2.67 4.67 2 5.5 2H10.5C11.33 2 12 2.67 12 3.5V4" stroke="#3B3BF9" strokeWidth="1.5" />
                <circle cx="8" cy="9" r="1.5" fill="#3B3BF9" />
              </svg>
              {isConnecting ? 'Connecting...' : 'Connect'}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
