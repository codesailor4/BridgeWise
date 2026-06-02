import React, { useState } from 'react';

interface ProviderMetric {
  provider: string;
  totalTransfers: number;
  successRate: number;
  avgLatencyMs: number;
  totalVolume: string;
  asset: string;
}

const MOCK_METRICS: ProviderMetric[] = [
  { provider: 'AllBridge', totalTransfers: 1240, successRate: 0.98, avgLatencyMs: 320, totalVolume: '1,200,000', asset: 'USDC' },
  { provider: 'Squid', totalTransfers: 870, successRate: 0.96, avgLatencyMs: 410, totalVolume: '850,000', asset: 'USDC' },
  { provider: 'Stargate', totalTransfers: 530, successRate: 0.99, avgLatencyMs: 280, totalVolume: '620,000', asset: 'USDC' },
];

function MetricCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{ padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: '8px', background: '#f8fafc', minWidth: '120px' }}>
      <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b' }}>{value}</div>
    </div>
  );
}

function ProviderRow({ metric }: { metric: ProviderMetric }) {
  const successPct = (metric.successRate * 100).toFixed(1);
  const barWidth = `${metric.successRate * 100}%`;
  return (
    <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
      <td style={{ padding: '10px 12px', fontWeight: 600 }}>{metric.provider}</td>
      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{metric.totalTransfers.toLocaleString()}</td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ flex: 1, background: '#e2e8f0', borderRadius: '4px', height: '8px' }}>
            <div style={{ width: barWidth, background: '#22c55e', borderRadius: '4px', height: '8px' }} />
          </div>
          <span style={{ fontSize: '13px', minWidth: '40px' }}>{successPct}%</span>
        </div>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right' }}>{metric.avgLatencyMs} ms</td>
      <td style={{ padding: '10px 12px', textAlign: 'right' }}>${metric.totalVolume} {metric.asset}</td>
    </tr>
  );
}

export default function StellarAnalyticsDashboard() {
  const [metrics] = useState<ProviderMetric[]>(MOCK_METRICS);

  const totalTransfers = metrics.reduce((s, m) => s + m.totalTransfers, 0);
  const avgSuccess = metrics.reduce((s, m) => s + m.successRate, 0) / metrics.length;
  const bestLatency = Math.min(...metrics.map((m) => m.avgLatencyMs));

  return (
    <div style={{ padding: '24px', fontFamily: 'system-ui, sans-serif', maxWidth: '900px', margin: '0 auto' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
        Stellar Cross-Bridge Analytics
      </h1>
      <p style={{ color: '#64748b', marginBottom: '24px' }}>
        Aggregated provider metrics across Stellar bridge integrations
      </p>

      {/* Summary cards */}
      <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '32px' }}>
        <MetricCard label="Total Transfers" value={totalTransfers.toLocaleString()} />
        <MetricCard label="Avg Success Rate" value={`${(avgSuccess * 100).toFixed(1)}%`} />
        <MetricCard label="Best Latency" value={`${bestLatency} ms`} />
        <MetricCard label="Active Providers" value={metrics.length} />
      </div>

      {/* Provider comparison table */}
      <div style={{ border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#1e293b' }}>Provider Metrics</h2>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Provider</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Transfers</th>
              <th style={{ padding: '10px 12px', textAlign: 'left', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Success Rate</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Avg Latency</th>
              <th style={{ padding: '10px 12px', textAlign: 'right', fontSize: '13px', color: '#64748b', fontWeight: 600 }}>Volume</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((m) => (
              <ProviderRow key={m.provider} metric={m} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Visualization placeholder */}
      <div style={{ marginTop: '24px', padding: '20px', border: '1px solid #e2e8f0', borderRadius: '8px', textAlign: 'center', color: '#94a3b8' }}>
        <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: '8px' }}>
          <rect x="4" y="28" width="8" height="16" rx="2" fill="#94a3b8" />
          <rect x="16" y="18" width="8" height="26" rx="2" fill="#64748b" />
          <rect x="28" y="10" width="8" height="34" rx="2" fill="#475569" />
          <rect x="40" y="22" width="8" height="22" rx="2" fill="#94a3b8" />
        </svg>
        <p style={{ margin: 0, fontSize: '14px' }}>Chart visualization — connect to live data source</p>
      </div>
    </div>
  );
}
