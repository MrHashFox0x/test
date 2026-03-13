import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, ReferenceLine, ReferenceDot, Tooltip } from 'recharts';
import bgBanniere from '../assets/bg-mentat-banniere.svg';

interface InterestRateChartProps {
  utilization: number;
  borrowAPY: number;
  supplyAPY: number;
}

// Curve data based on adaptive IRM: target utilization 80%, initial rate at target 10%
const curveData = [
  { utilization: 0, borrowRate: 0.9, supplyRate: 0 },
  { utilization: 10, borrowRate: 1.2, supplyRate: 0.12 },
  { utilization: 20, borrowRate: 1.6, supplyRate: 0.31 },
  { utilization: 30, borrowRate: 2.2, supplyRate: 0.64 },
  { utilization: 40, borrowRate: 3.0, supplyRate: 1.16 },
  { utilization: 50, borrowRate: 4.0, supplyRate: 1.94 },
  { utilization: 60, borrowRate: 5.5, supplyRate: 3.20 },
  { utilization: 70, borrowRate: 7.4, supplyRate: 5.03 },
  { utilization: 80, borrowRate: 10.0, supplyRate: 7.76 },
  { utilization: 85, borrowRate: 16.0, supplyRate: 13.19 },
  { utilization: 90, borrowRate: 25.0, supplyRate: 21.83 },
  { utilization: 95, borrowRate: 40.0, supplyRate: 36.86 },
  { utilization: 100, borrowRate: 60.0, supplyRate: 58.20 },
];

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="glass-card" style={{ padding: '10px 14px', fontSize: '12px' }}>
      <div style={{ color: '#000', marginBottom: '4px' }}>Utilization: {label}%</div>
      <div style={{ color: '#F97316', fontWeight: 500 }}>Borrow: {payload[0]?.value?.toFixed(2)}%</div>
      <div style={{ color: '#3B3BF9', fontWeight: 500 }}>Supply: {payload[1]?.value?.toFixed(2)}%</div>
    </div>
  );
}

function DotLabel({ viewBox, value, color }: any) {
  const { cx, cy } = viewBox;
  return (
    <g>
      <rect
        x={cx + 8} y={cy - 10}
        width={46} height={20}
        rx={6}
        fill={color} fillOpacity={0.12}
        stroke={color} strokeOpacity={0.3} strokeWidth={1}
      />
      <text
        x={cx + 31} y={cy + 3}
        textAnchor="middle"
        fill={color}
        fontSize={11}
        fontWeight={700}
      >
        {value}
      </text>
    </g>
  );
}

export function InterestRateChart({ utilization, borrowAPY, supplyAPY }: InterestRateChartProps) {
  return (
    <div style={{
      padding: '28px 32px',
      position: 'relative',
      overflow: 'hidden',
      backgroundImage: `url(${bgBanniere})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      borderRadius: '16px',
    }}>
      {/* Dark overlay for readability */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'rgba(255, 255, 255, 0.75)',
        pointerEvents: 'none',
      }} />

      <div style={{ position: 'relative', zIndex: 1 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: '24px',
        }}>
          <h3 style={{ color: '#000', fontWeight: 600, fontSize: '16px' }}>Interest Rate Model</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#F97316' }} />
              <span style={{ fontSize: '12px', color: '#000' }}>Borrow APY</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3B3BF9' }} />
              <span style={{ fontSize: '12px', color: '#000' }}>Supply APY</span>
            </div>
          </div>
        </div>

        <div style={{ height: '240px' }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={curveData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(59,59,249,0.06)" />
              <XAxis
                dataKey="utilization"
                stroke="#000"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
                ticks={[0, 25, 50, 70, 100]}
              />
              <YAxis
                stroke="#000"
                fontSize={11}
                tickFormatter={(v) => `${v}%`}
                ticks={[0, 10, 20, 30, 40, 50, 60]}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine
                x={utilization}
                stroke="rgba(59,59,249,0.3)"
                strokeDasharray="4 4"
                label={{
                  value: `${utilization.toFixed(0)}%`,
                  position: 'top',
                  fill: '#000',
                  fontSize: 10,
                }}
              />
              <ReferenceLine x={80} stroke="rgba(16,185,129,0.4)" strokeDasharray="3 3" />
              <Line type="monotone" dataKey="borrowRate" stroke="#F97316" strokeWidth={2.5} dot={false} />
              <Line type="monotone" dataKey="supplyRate" stroke="#3B3BF9" strokeWidth={2.5} dot={false} />

              {/* Current position dots */}
              <ReferenceDot
                x={utilization}
                y={borrowAPY}
                r={6}
                fill="#F97316"
                stroke="#fff"
                strokeWidth={2}
                label={<DotLabel value={`${borrowAPY.toFixed(1)}%`} color="#F97316" />}
              />
              <ReferenceDot
                x={utilization}
                y={supplyAPY}
                r={6}
                fill="#3B3BF9"
                stroke="#fff"
                strokeWidth={2}
                label={<DotLabel value={`${supplyAPY.toFixed(1)}%`} color="#3B3BF9" />}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div style={{
          display: 'flex', justifyContent: 'space-between',
          marginTop: '12px', fontSize: '12px', color: '#000',
        }}>
          <span>Optimal: 80%</span>
          <span>Current: {utilization.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}
