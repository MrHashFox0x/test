interface MarketStatsProps {
  totalDeposits: number;
  availableLiquidity: number;
  supplyAPY: number;
  borrowAPY: number;
  utilization: number;
  maxLTV: number;
  liquidationLTV: number;
  alphaPrice: number;
  isLoading: boolean;
  error: string | null;
}

function StatItem({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: '12px', color: '#9B9BB5', marginBottom: '6px', letterSpacing: '0.02em' }}>
        {label}
      </div>
      <div style={{
        fontSize: '18px',
        fontWeight: 600,
        color: accent || '#1A1A3E',
        fontVariantNumeric: 'tabular-nums',
      }}>
        {value}
      </div>
    </div>
  );
}

export function MarketStats({
  totalDeposits, availableLiquidity, supplyAPY, borrowAPY,
  utilization, maxLTV, liquidationLTV, alphaPrice,
  isLoading, error,
}: MarketStatsProps) {
  return (
    <div className="glass-card" style={{ padding: '28px 32px' }}>
      {isLoading && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          color: '#3B3BF9', fontSize: '13px', marginBottom: '20px',
        }}>
          <div style={{
            width: '8px', height: '8px', background: '#3B3BF9',
            borderRadius: '50%', animation: 'pulse 2s infinite',
          }} />
          Loading market data...
        </div>
      )}
      {error && (
        <div style={{
          fontSize: '13px', color: '#dc2626', marginBottom: '20px',
          padding: '10px 14px', borderRadius: '10px',
          background: '#fef2f2', border: '1px solid #fecaca',
        }}>
          Unable to load market data: {error}
        </div>
      )}

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '24px 40px',
      }}>
        <StatItem label="Total Supply" value={`${totalDeposits.toFixed(4)} TAO`} />
        <StatItem label="Available Liquidity" value={`${availableLiquidity.toFixed(4)} TAO`} />
        <StatItem label="Supply APY" value={`${supplyAPY.toFixed(2)}%`} accent="#059669" />
        <StatItem label="Borrow APY" value={`${borrowAPY.toFixed(2)}%`} accent="#ea580c" />
        <StatItem label="Utilization Rate" value={`${utilization.toFixed(1)}%`} />
        <StatItem label="Alpha Price" value={`${alphaPrice.toFixed(4)} TAO`} accent="#3B3BF9" />
        <StatItem label="Max LTV" value={`${maxLTV}%`} />
        <StatItem label="Liquidation LTV" value={`${liquidationLTV}%`} />
      </div>
    </div>
  );
}
