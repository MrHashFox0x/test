import { useState } from 'react';
import { calculateMaxBorrow } from '../../utils/alphaPrice';

interface BorrowPanelProps {
  collateralAmount: string;
  setCollateralAmount: (v: string) => void;
  borrowAmount: string;
  setBorrowAmount: (v: string) => void;
  repayAmount: string;
  setRepayAmount: (v: string) => void;
  withdrawCollateralAmount: string;
  setWithdrawCollateralAmount: (v: string) => void;
  alphaPrice: number;
  maxLTV: number;
  liquidationLTV: number;

  userCollateral: number;
  userLoan: number;
  outstandingDebt: number;
  healthFactor: number;
  currentLTV: number;
  maxBorrowPower: number;
  availableToBorrow: number;
  isBorrowExceedingMax: boolean;
  newCollateralMaxBorrow: number;
  isRepayExceedingDebt: boolean;
  isWithdrawCollateralExceeding: boolean;
  isRepayWithdrawUnsafe: boolean;
  repayAndWithdrawHealthFactor: number;
  repayBreakdown: import('../../utils/adaptiveIRM').RepayBreakdown | null;
  isConnected: boolean;
  isConnecting: boolean;
  isTransacting: boolean;
  txStatus: string;
  txError: string | null;
  onBorrow: () => void;
  onRepay: () => void;
  onConnect: () => void;
}

function HealthBadge({ value }: { value: number }) {
  const isGood = value === Infinity || value > 1.5;
  const isWarn = value > 1.1 && value <= 1.5;
  const color = isGood ? '#059669' : isWarn ? '#d97706' : '#dc2626';
  const bg = isGood ? '#ecfdf5' : isWarn ? '#fffbeb' : '#fef2f2';
  const border = isGood ? '#a7f3d0' : isWarn ? '#fde68a' : '#fecaca';
  return (
    <span style={{
      padding: '4px 12px',
      borderRadius: '9999px',
      fontSize: '13px',
      fontWeight: 700,
      background: bg,
      border: `1.5px solid ${border}`,
      color,
    }}>
      {value === Infinity ? '---' : value.toFixed(2)}
    </span>
  );
}

function InputField({ label, value, onChange, placeholder, suffix, disabled, rightLabel, onMax }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix: string;
  disabled?: boolean;
  rightLabel?: string;
  onMax?: () => void;
}) {
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '8px',
      }}>
        <label style={{ fontSize: '13px', color: '#6B6B8D', fontWeight: 500 }}>{label}</label>
        {rightLabel && (
          <span style={{ fontSize: '12px', color: '#059669', fontWeight: 600 }}>{rightLabel}</span>
        )}
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '12px 16px',
        borderRadius: '14px',
        background: '#F6F4FF',
        border: '1.5px solid rgba(59,59,249,0.1)',
        transition: 'border-color 0.2s',
      }}>
        <input
          type="number"
          placeholder={placeholder || '0.00'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          style={{
            background: 'transparent',
            fontSize: '20px',
            fontWeight: 600,
            color: '#1A1A3E',
            outline: 'none',
            border: 'none',
            flex: 1,
            minWidth: 0,
            fontVariantNumeric: 'tabular-nums',
          }}
        />
        {onMax && (
          <button
            onClick={onMax}
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#3B3BF9',
              background: 'rgba(59,59,249,0.08)',
              border: 'none',
              borderRadius: '6px',
              padding: '4px 10px',
              cursor: 'pointer',
              flexShrink: 0,
              letterSpacing: '0.03em',
            }}
          >
            MAX
          </button>
        )}
        <span style={{
          fontSize: '13px',
          fontWeight: 600,
          color: '#6B6B8D',
          background: 'rgba(59,59,249,0.06)',
          padding: '5px 12px',
          borderRadius: '8px',
          flexShrink: 0,
        }}>
          {suffix}
        </span>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, accent, badge }: {
  label: string; value?: string; accent?: string; badge?: React.ReactNode;
}) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '4px 0',
    }}>
      <span style={{ fontSize: '13px', color: '#6B6B8D' }}>{label}</span>
      {badge || <span style={{ fontSize: '13px', fontWeight: 600, color: accent || '#1A1A3E' }}>{value}</span>}
    </div>
  );
}

export function BorrowPanel({
  collateralAmount, setCollateralAmount,
  borrowAmount, setBorrowAmount,
  repayAmount, setRepayAmount,
  withdrawCollateralAmount, setWithdrawCollateralAmount,
  alphaPrice, maxLTV, liquidationLTV,
  userCollateral, outstandingDebt,
  healthFactor, currentLTV, maxBorrowPower, availableToBorrow,
  isBorrowExceedingMax, newCollateralMaxBorrow,
  isRepayExceedingDebt, isWithdrawCollateralExceeding,
  isRepayWithdrawUnsafe, repayAndWithdrawHealthFactor,
  repayBreakdown,
  isConnected, isConnecting, isTransacting,
  txStatus, txError,
  onBorrow, onRepay, onConnect,
}: BorrowPanelProps) {
  const [mode, setMode] = useState<'borrow' | 'repay'>('borrow');
  const wantsToWithdrawCollateral = parseFloat(withdrawCollateralAmount) > 0;

  return (
    <div className="glass-card" style={{ overflow: 'hidden' }}>
      {/* Sub-tabs */}
      <div style={{
        display: 'flex',
        borderBottom: '1px solid rgba(59,59,249,0.08)',
      }}>
        <button
          onClick={() => setMode('borrow')}
          style={{
            flex: 1,
            padding: '14px 0',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            color: mode === 'borrow' ? '#3B3BF9' : '#9B9BB5',
            borderBottom: mode === 'borrow' ? '2px solid #3B3BF9' : '2px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Borrow
        </button>
        <button
          onClick={() => setMode('repay')}
          style={{
            flex: 1,
            padding: '14px 0',
            fontSize: '14px',
            fontWeight: 600,
            border: 'none',
            cursor: 'pointer',
            background: 'transparent',
            color: mode === 'repay' ? '#3B3BF9' : '#9B9BB5',
            borderBottom: mode === 'repay' ? '2px solid #3B3BF9' : '2px solid transparent',
            transition: 'all 0.2s',
          }}
        >
          Repay
        </button>
      </div>

      <div style={{ padding: '22px' }}>
        {mode === 'borrow' ? (
          <>
            {/* Collateral input */}
            <InputField
              label="Collateral"
              value={collateralAmount}
              onChange={setCollateralAmount}
              suffix="ALPHA"
              disabled={isTransacting}
              rightLabel={undefined}
              onMax={undefined}
            />

            {/* Price hint */}
            <div style={{
              fontSize: '11px', color: '#9B9BB5', marginTop: '-8px', marginBottom: '14px',
              paddingLeft: '4px',
            }}>
              1 Alpha = {alphaPrice.toFixed(4)} TAO
            </div>

            {/* Borrow amount */}
            <InputField
              label="Borrow Amount"
              value={borrowAmount}
              onChange={setBorrowAmount}
              suffix="TAO"
              disabled={isTransacting}
              rightLabel={`Max: ${availableToBorrow.toFixed(5)} TAO`}
              onMax={() => {
                const max = calculateMaxBorrow(parseFloat(collateralAmount) || 0, alphaPrice, maxLTV / 100);
                setBorrowAmount(max.toFixed(5));
              }}
            />

            {/* Summary card with calculation details */}
            <div style={{
              padding: '14px 16px',
              borderRadius: '12px',
              background: '#F6F4FF',
              border: '1.5px solid rgba(59,59,249,0.08)',
              marginBottom: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}>
              {/* Borrow Power */}
              <div>
                <SummaryRow label="Borrow Power" value={`${maxBorrowPower.toFixed(5)} TAO`} />
                <div style={{ fontSize: '11px', color: '#9B9BB5', paddingLeft: '4px', marginTop: '2px' }}>
                  {(parseFloat(collateralAmount) || 0).toFixed(5)} ALPHA x {alphaPrice.toFixed(4)} TAO x {maxLTV}% LTV = {maxBorrowPower.toFixed(5)} TAO
                </div>
              </div>

              <div style={{ height: '1px', background: 'rgba(59,59,249,0.06)' }} />

              {/* Current LTV */}
              <div>
                <SummaryRow
                  label="Current LTV"
                  value={`${currentLTV.toFixed(2)}%`}
                  accent={currentLTV > maxLTV ? '#dc2626' : '#1A1A3E'}
                />
                {(parseFloat(borrowAmount) || 0) > 0 && (
                  <div style={{ fontSize: '11px', color: '#9B9BB5', paddingLeft: '4px', marginTop: '2px' }}>
                    {(parseFloat(borrowAmount) || 0).toFixed(5)} TAO / ({(parseFloat(collateralAmount) || 0).toFixed(5)} ALPHA x {alphaPrice.toFixed(4)} TAO) = {currentLTV.toFixed(2)}%
                  </div>
                )}
              </div>

              <div style={{ height: '1px', background: 'rgba(59,59,249,0.06)' }} />

              {/* Health Factor */}
              <div>
                <SummaryRow label="Health Factor" badge={<HealthBadge value={healthFactor} />} />
                {(parseFloat(borrowAmount) || 0) > 0 && (
                  <div style={{ fontSize: '11px', color: '#9B9BB5', paddingLeft: '4px', marginTop: '2px' }}>
                    ({(parseFloat(collateralAmount) || 0).toFixed(5)} ALPHA x {alphaPrice.toFixed(4)} TAO x {liquidationLTV}% LLTV) / {(parseFloat(borrowAmount) || 0).toFixed(5)} TAO = {healthFactor === Infinity ? '---' : healthFactor.toFixed(2)}
                  </div>
                )}
                <div style={{ fontSize: '11px', color: healthFactor < 1.2 && healthFactor !== Infinity ? '#dc2626' : '#9B9BB5', paddingLeft: '4px', marginTop: '2px' }}>
                  Liquidation below 1.00 | Max LTV: {maxLTV}% | Liquidation LTV: {liquidationLTV}%
                </div>
              </div>
            </div>

            {/* Action */}
            <ActionButton
              onClick={isConnected && !isBorrowExceedingMax ? onBorrow : onConnect}
              disabled={isConnecting || isTransacting || (isConnected && isBorrowExceedingMax)}
              isError={isConnected && isBorrowExceedingMax}
              label={
                isTransacting ? 'Processing...'
                : isConnecting ? 'Connecting...'
                : isConnected && isBorrowExceedingMax ? `Exceeds Max (${newCollateralMaxBorrow.toFixed(5)} TAO)`
                : isConnected ? 'Deposit & Borrow'
                : 'Connect Wallet'
              }
            />
          </>
        ) : (
          <>
            {/* Repay amount */}
            <InputField
              label="Repay Amount"
              value={repayAmount}
              onChange={setRepayAmount}
              suffix="TAO"
              disabled={isTransacting}
              onMax={() => setRepayAmount(outstandingDebt.toFixed(5))}
            />

            {/* Withdraw collateral */}
            <InputField
              label="Withdraw Collateral"
              value={withdrawCollateralAmount}
              onChange={setWithdrawCollateralAmount}
              placeholder="0.00 (optional)"
              suffix="ALPHA"
              disabled={isTransacting}
              rightLabel={userCollateral > 0 ? `Max: ${userCollateral.toFixed(2)}` : undefined}
              onMax={() => setWithdrawCollateralAmount(userCollateral.toFixed(4))}
            />

            {/* Summary card */}
            <div style={{
              padding: '14px 16px',
              borderRadius: '12px',
              background: isRepayWithdrawUnsafe ? '#fef2f2' : '#F6F4FF',
              border: `1.5px solid ${isRepayWithdrawUnsafe ? '#fecaca' : 'rgba(59,59,249,0.08)'}`,
              marginBottom: '18px',
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}>
              <SummaryRow label="Outstanding Debt" value={`${outstandingDebt.toFixed(5)} TAO`} />
              {repayBreakdown && (parseFloat(repayAmount) || 0) > 0 && (
                <>
                  <div style={{ height: '1px', background: 'rgba(59,59,249,0.06)' }} />
                  <SummaryRow
                    label="Amount to repay"
                    value={`${repayBreakdown.amountRepaid.toFixed(5)} TAO`}
                  />
                  <SummaryRow
                    label="Of which interest (accrued)"
                    value={`${repayBreakdown.interestPortion.toFixed(5)} TAO`}
                    accent="#dc2626"
                  />
                  {repayBreakdown.interestPortionOfRepay >= 0.00001 && (
                    <SummaryRow
                      label="Interest in this repayment"
                      value={`~${repayBreakdown.interestPortionOfRepay.toFixed(5)} TAO`}
                      accent="#b91c1c"
                    />
                  )}
                  <div style={{
                    fontSize: '11px',
                    color: '#6B6B8D',
                    paddingLeft: '4px',
                    marginTop: '-2px',
                  }}>
                    Your current debt includes {repayBreakdown.interestPortion.toFixed(5)} TAO in accrued interest since last protocol update.
                  </div>
                  <div style={{ height: '1px', background: 'rgba(59,59,249,0.06)' }} />
                </>
              )}
              <SummaryRow
                label="Remaining Debt"
                value={`${Math.max(0, outstandingDebt - (parseFloat(repayAmount) || 0)).toFixed(5)} TAO`}
              />
              <SummaryRow
                label="Remaining Collateral"
                value={`${Math.max(0, userCollateral - (parseFloat(withdrawCollateralAmount) || 0)).toFixed(5)} Alpha`}
              />
              <SummaryRow label="Health Factor After" badge={<HealthBadge value={repayAndWithdrawHealthFactor} />} />
            </div>

            {/* Action */}
            <ActionButton
              onClick={isConnected ? onRepay : onConnect}
              disabled={isConnecting || isTransacting || (isConnected && (outstandingDebt <= 0 || isRepayExceedingDebt || isWithdrawCollateralExceeding || isRepayWithdrawUnsafe))}
              isError={isConnected && (isRepayExceedingDebt || isWithdrawCollateralExceeding || isRepayWithdrawUnsafe)}
              label={
                isTransacting ? 'Processing...'
                : isConnecting ? 'Connecting...'
                : isConnected && isRepayExceedingDebt ? `Exceeds Debt (${outstandingDebt.toFixed(5)} TAO)`
                : isConnected && isWithdrawCollateralExceeding ? `Exceeds Collateral (${userCollateral.toFixed(2)} Alpha)`
                : isConnected && isRepayWithdrawUnsafe ? 'Position Would Be Liquidatable'
                : isConnected && outstandingDebt <= 0 ? 'No Debt to Repay'
                : isConnected ? (wantsToWithdrawCollateral ? 'Repay & Withdraw' : 'Repay')
                : 'Connect Wallet'
              }
            />
          </>
        )}

        {/* Status messages */}
        {txStatus && (
          <div style={{
            marginTop: '16px',
            padding: '14px 16px',
            borderRadius: '12px',
            background: '#eff6ff',
            border: '1.5px solid #bfdbfe',
            color: '#3B3BF9',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            {txStatus}
          </div>
        )}
        {txError && (
          <div style={{
            marginTop: '16px',
            padding: '14px 16px',
            borderRadius: '12px',
            background: '#fef2f2',
            border: '1.5px solid #fecaca',
            color: '#dc2626',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            {txError}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ onClick, disabled, isError, label }: {
  onClick: () => void; disabled: boolean; isError: boolean; label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: '100%',
        padding: '14px',
        borderRadius: '14px',
        border: 'none',
        fontSize: '15px',
        fontWeight: 600,
        color: '#fff',
        background: isError ? '#dc2626' : '#3B3BF9',
        boxShadow: isError ? '0 4px 16px rgba(220,38,38,0.25)' : '0 4px 16px rgba(59,59,249,0.3)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'all 0.2s',
      }}
    >
      {label}
    </button>
  );
}
