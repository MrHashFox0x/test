import { useState } from 'react';

interface EarnPanelProps {
  depositAmount: string;
  setDepositAmount: (v: string) => void;
  withdrawAmount: string;
  setWithdrawAmount: (v: string) => void;
  supplyAPY: number;
  userDeposit: number;
  taoBalance: number;
  withdrawBreakdown: import('../../utils/adaptiveIRM').WithdrawBreakdown | null;
  isConnected: boolean;
  isConnecting: boolean;
  isTransacting: boolean;
  txStatus: string;
  txError: string | null;
  onDeposit: () => void;
  onWithdraw: () => void;
  onConnect: () => void;
}

function PercentButton({ label, onClick, active }: { label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: '12px',
        fontWeight: 600,
        color: active ? '#fff' : '#3B3BF9',
        background: active ? '#3B3BF9' : 'rgba(59,59,249,0.06)',
        border: '1px solid ' + (active ? '#3B3BF9' : 'rgba(59,59,249,0.12)'),
        borderRadius: '8px',
        padding: '6px 0',
        cursor: 'pointer',
        transition: 'all 0.15s',
        flex: 1,
      }}
    >
      {label}
    </button>
  );
}

export function EarnPanel({
  depositAmount, setDepositAmount,
  withdrawAmount, setWithdrawAmount,
  supplyAPY, userDeposit, taoBalance,
  withdrawBreakdown,
  isConnected, isConnecting, isTransacting,
  txStatus, txError,
  onDeposit, onWithdraw, onConnect,
}: EarnPanelProps) {
  const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');

  const setDepositPercent = (pct: number) => {
    const amount = taoBalance * pct;
    setDepositAmount(amount > 0 ? amount.toFixed(4) : '');
  };

  const setWithdrawPercent = (pct: number) => {
    const amount = userDeposit * pct;
    setWithdrawAmount(amount > 0 ? amount.toFixed(4) : '');
  };

  const depositNum = parseFloat(depositAmount) || 0;
  const withdrawNum = parseFloat(withdrawAmount) || 0;

  return (
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      {/* Sub-tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(59,59,249,0.08)',
      }}>
        <button
          onClick={() => setMode('deposit')}
          style={{
            flex: 1, padding: '16px 0', fontSize: '14px', fontWeight: 600,
            border: 'none', cursor: 'pointer', background: 'transparent',
            color: mode === 'deposit' ? '#3B3BF9' : '#9B9BB5',
            borderBottom: mode === 'deposit' ? '2px solid #3B3BF9' : '2px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Deposit
        </button>
        <button
          onClick={() => setMode('withdraw')}
          style={{
            flex: 1, padding: '16px 0', fontSize: '14px', fontWeight: 600,
            border: 'none', cursor: 'pointer', background: 'transparent',
            color: mode === 'withdraw' ? '#3B3BF9' : '#9B9BB5',
            borderBottom: mode === 'withdraw' ? '2px solid #3B3BF9' : '2px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Withdraw
        </button>
      </div>

      <div style={{ padding: '28px' }}>
        {mode === 'deposit' ? (
          <>
            {/* Label + balance */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '10px',
            }}>
              <label style={{ fontSize: '13px', color: '#6B6B8D', fontWeight: 500 }}>Amount</label>
              <span style={{ fontSize: '12px', color: '#9B9BB5' }}>
                Balance: <span style={{ fontWeight: 600, color: '#1A1A3E' }}>{taoBalance.toFixed(4)}</span> TAO
              </span>
            </div>

            {/* Input field */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '16px 18px', borderRadius: '14px',
              background: '#F6F4FF', border: '1.5px solid rgba(59,59,249,0.1)',
              marginBottom: '12px',
            }}>
              <input
                type="number"
                placeholder="0.00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                disabled={isTransacting}
                style={{
                  background: 'transparent', fontSize: '24px', fontWeight: 600,
                  color: '#1A1A3E', outline: 'none', border: 'none',
                  flex: 1, minWidth: 0, fontVariantNumeric: 'tabular-nums',
                }}
              />
              <span style={{
                fontSize: '14px', fontWeight: 600, color: '#6B6B8D',
                background: 'rgba(59,59,249,0.06)', padding: '6px 14px',
                borderRadius: '8px', flexShrink: 0,
              }}>
                TAO
              </span>
            </div>

            {/* Percent buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px' }}>
              <PercentButton label="10%" onClick={() => setDepositPercent(0.1)} active={taoBalance > 0 && Math.abs(depositNum - taoBalance * 0.1) < 0.001} />
              <PercentButton label="25%" onClick={() => setDepositPercent(0.25)} active={taoBalance > 0 && Math.abs(depositNum - taoBalance * 0.25) < 0.001} />
              <PercentButton label="50%" onClick={() => setDepositPercent(0.5)} active={taoBalance > 0 && Math.abs(depositNum - taoBalance * 0.5) < 0.001} />
              <PercentButton label="MAX" onClick={() => setDepositPercent(1)} active={taoBalance > 0 && Math.abs(depositNum - taoBalance) < 0.001} />
            </div>

            {/* Supply APY */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 18px', borderRadius: '14px',
              background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
              border: '1.5px solid #a7f3d0', marginBottom: '28px',
            }}>
              <span style={{ fontSize: '14px', color: '#065f46', fontWeight: 500 }}>Supply APY</span>
              <span style={{ fontSize: '18px', color: '#059669', fontWeight: 700 }}>{supplyAPY.toFixed(2)}%</span>
            </div>
          </>
        ) : (
          <>
            {/* Label + available */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: '10px',
            }}>
              <label style={{ fontSize: '13px', color: '#6B6B8D', fontWeight: 500 }}>Amount</label>
              <span style={{ fontSize: '12px', color: '#9B9BB5' }}>
                Deposited: <span style={{ fontWeight: 600, color: '#1A1A3E' }}>{userDeposit.toFixed(4)}</span> TAO
              </span>
            </div>

            {/* Input field */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '16px 18px', borderRadius: '14px',
              background: '#F6F4FF', border: '1.5px solid rgba(59,59,249,0.1)',
              marginBottom: '12px',
            }}>
              <input
                type="number"
                placeholder="0.00"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                disabled={isTransacting}
                style={{
                  background: 'transparent', fontSize: '24px', fontWeight: 600,
                  color: '#1A1A3E', outline: 'none', border: 'none',
                  flex: 1, minWidth: 0, fontVariantNumeric: 'tabular-nums',
                }}
              />
              <span style={{
                fontSize: '14px', fontWeight: 600, color: '#6B6B8D',
                background: 'rgba(59,59,249,0.06)', padding: '6px 14px',
                borderRadius: '8px', flexShrink: 0,
              }}>
                TAO
              </span>
            </div>

            {/* Percent buttons */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: withdrawBreakdown ? '16px' : '28px' }}>
              <PercentButton label="10%" onClick={() => setWithdrawPercent(0.1)} active={userDeposit > 0 && Math.abs(withdrawNum - userDeposit * 0.1) < 0.001} />
              <PercentButton label="25%" onClick={() => setWithdrawPercent(0.25)} active={userDeposit > 0 && Math.abs(withdrawNum - userDeposit * 0.25) < 0.001} />
              <PercentButton label="50%" onClick={() => setWithdrawPercent(0.5)} active={userDeposit > 0 && Math.abs(withdrawNum - userDeposit * 0.5) < 0.001} />
              <PercentButton label="MAX" onClick={() => setWithdrawPercent(1)} active={userDeposit > 0 && Math.abs(withdrawNum - userDeposit) < 0.001} />
            </div>

            {/* Withdraw breakdown: amount received + yield */}
            {withdrawBreakdown && withdrawNum > 0 && (
              <div style={{
                padding: '14px 16px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #ecfdf5 0%, #f0fdf4 100%)',
                border: '1.5px solid #a7f3d0',
                marginBottom: '28px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '13px', color: '#065f46', fontWeight: 500 }}>You will receive</span>
                  <span style={{ fontSize: '15px', fontWeight: 700, color: '#059669' }}>
                    {withdrawBreakdown.amountToReceive.toFixed(5)} TAO
                  </span>
                </div>
                {withdrawBreakdown.yieldPortionOfWithdraw >= 0.00001 && (
                  <>
                    <div style={{ height: '1px', background: 'rgba(5,150,105,0.2)' }} />
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', color: '#047857', fontWeight: 500 }}>Of which from yield</span>
                      <span style={{ fontSize: '14px', fontWeight: 600, color: '#059669' }}>
                        ~{withdrawBreakdown.yieldPortionOfWithdraw.toFixed(5)} TAO
                      </span>
                    </div>
                    <div style={{
                      fontSize: '11px',
                      color: '#047857',
                      paddingLeft: '4px',
                    }}>
                      Your position has accrued {withdrawBreakdown.yieldSinceLastUpdate.toFixed(5)} TAO in yield since the last protocol update.
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* Status messages */}
        {txStatus && (
          <div style={{
            marginBottom: '16px', padding: '14px 16px', borderRadius: '12px',
            background: '#eff6ff', border: '1.5px solid #bfdbfe',
            color: '#3B3BF9', fontSize: '13px', fontWeight: 500,
          }}>
            {txStatus}
          </div>
        )}
        {txError && (
          <div style={{
            marginBottom: '16px', padding: '14px 16px', borderRadius: '12px',
            background: '#fef2f2', border: '1.5px solid #fecaca',
            color: '#dc2626', fontSize: '13px', fontWeight: 500,
          }}>
            {txError}
          </div>
        )}

        {/* Action button */}
        <button
          onClick={isConnected ? (mode === 'deposit' ? onDeposit : onWithdraw) : onConnect}
          disabled={isConnecting || isTransacting}
          style={{
            width: '100%', padding: '16px', borderRadius: '14px',
            border: 'none', fontSize: '15px', fontWeight: 600, color: '#fff',
            background: '#3B3BF9', boxShadow: '0 4px 16px rgba(59,59,249,0.3)',
            cursor: (isConnecting || isTransacting) ? 'not-allowed' : 'pointer',
            opacity: (isConnecting || isTransacting) ? 0.5 : 1,
            transition: 'all 0.2s',
          }}
        >
          {isTransacting ? 'Processing...'
            : isConnecting ? 'Connecting...'
            : !isConnected ? 'Connect Wallet'
            : mode === 'deposit' ? 'Deposit TAO' : 'Withdraw TAO'}
        </button>
      </div>
    </div>
  );
}
