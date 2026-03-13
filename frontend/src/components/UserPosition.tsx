interface UserPositionProps {
  supplyAssets: number;
  borrowAssets: number;
  collateral: number;
  healthFactor: number;
  supplyAPY: number;
  borrowAPY: number;
  alphaPrice: number;
  isConnected: boolean;
}

function StatItem({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
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
      {sub && (
        <div style={{ fontSize: '11px', color: accent || '#9B9BB5', fontWeight: 500, marginTop: '3px' }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export function UserPosition({
  supplyAssets, borrowAssets, collateral,
  healthFactor, supplyAPY, borrowAPY, alphaPrice,
  isConnected,
}: UserPositionProps) {
  const hasBorrow = borrowAssets > 0;
  const hasSupply = supplyAssets > 0;

  const currentLTV = collateral > 0 && alphaPrice > 0
    ? (borrowAssets / (collateral * alphaPrice)) * 100 : 0;

  const healthColor = healthFactor === Infinity || healthFactor > 1.5
    ? '#059669' : healthFactor > 1.1 ? '#d97706' : '#dc2626';

  const healthDisplay = !isConnected || (!hasSupply && !hasBorrow)
    ? '---'
    : healthFactor === Infinity ? 'Safe' : healthFactor.toFixed(2);

  return (
    <div className="glass-card" style={{ padding: '28px 32px' }}>
      <div style={{ fontSize: '13px', fontWeight: 600, color: '#3B3BF9', marginBottom: '16px', letterSpacing: '0.03em' }}>
        Your Position
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '24px 40px',
      }}>
        <StatItem
          label="Supplied"
          value={`${supplyAssets.toFixed(5)} TAO`}
          sub={hasSupply ? `Earning ${supplyAPY.toFixed(2)}% APY` : undefined}
          accent={hasSupply ? '#059669' : undefined}
        />
        <StatItem
          label="Borrowed"
          value={`${borrowAssets.toFixed(5)} TAO`}
          sub={hasBorrow ? `Paying ${borrowAPY.toFixed(2)}% APY` : undefined}
          accent={hasBorrow ? '#ea580c' : undefined}
        />
        <StatItem
          label="Collateral"
          value={`${collateral.toFixed(5)} ALPHA`}
        />
        <StatItem
          label="Current LTV"
          value={`${currentLTV.toFixed(1)}%`}
        />
        <StatItem
          label="Health Factor"
          value={healthDisplay}
          accent={isConnected && (hasSupply || hasBorrow) ? healthColor : undefined}
        />
      </div>
    </div>
  );
}
