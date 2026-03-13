interface MarketInfoProps {
  maxLTV: number;
  liquidationLTV: number;
  alphaPrice: number;
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '4px 0' }}>
      <div style={{ fontSize: '12px', color: '#9B9BB5', marginBottom: '6px', letterSpacing: '0.02em' }}>
        {label}
      </div>
      <div style={{ fontSize: '16px', fontWeight: 600, color: '#1A1A3E' }}>
        {value}
      </div>
    </div>
  );
}

export function MarketInfo({ maxLTV, liquidationLTV, alphaPrice }: MarketInfoProps) {
  return (
    <div className="glass-card" style={{ padding: '28px 32px' }}>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '24px 40px',
      }}>
        <StatItem label="Loan Asset" value="TAO" />
        <StatItem label="Collateral Asset" value="Subnet Alpha" />
        <StatItem label="Interest Rate Model" value="Adaptive Curve" />
        <StatItem label="Optimal Utilization" value="70%" />
      </div>
    </div>
  );
}
