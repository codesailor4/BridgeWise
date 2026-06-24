import React, { useState } from 'react';
import { RouteReliabilityMetric, RouteFilter } from './types';

const MOCK_METRICS: RouteReliabilityMetric[] = [
  {
    routeId: 'stellar-eth-usdc',
    sourceChain: 'Stellar',
    destinationChain: 'Ethereum',
    asset: 'USDC',
    successRate: 0.987,
    avgLatencyMs: 4200,
    p95LatencyMs: 8900,
    totalTransfers: 3140,
    failureCount: 41,
    lastUpdated: new Date().toISOString(),
  },
  {
    routeId: 'stellar-polygon-usdc',
    sourceChain: 'Stellar',
    destinationChain: 'Polygon',
    asset: 'USDC',
    successRate: 0.963,
    avgLatencyMs: 3100,
    p95LatencyMs: 6200,
    totalTransfers: 1870,
    failureCount: 69,
    lastUpdated: new Date().toISOString(),
  },
  {
    routeId: 'stellar-base-xlm',
    sourceChain: 'Stellar',
    destinationChain: 'Base',
    asset: 'XLM',
    successRate: 0.994,
    avgLatencyMs: 2800,
    p95LatencyMs: 5100,
    totalTransfers: 920,
    failureCount: 6,
    lastUpdated: new Date().toISOString(),
  },
  {
    routeId: 'eth-stellar-usdc',
    sourceChain: 'Ethereum',
    destinationChain: 'Stellar',
    asset: 'USDC',
    successRate: 0.941,
    avgLatencyMs: 6700,
    p95LatencyMs: 14200,
    totalTransfers: 2310,
    failureCount: 136,
    lastUpdated: new Date().toISOString(),
  },
];

function reliabilityColor(rate: number): string {
  if (rate >= 0.98) return '#22c55e';
  if (rate >= 0.95) return '#f59e0b';
  return '#ef4444';
}

function ReliabilityBar({ rate }: { rate: number }) {
  const color = reliabilityColor(rate);
  const pct = (rate * 100).toFixed(0) + '%';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, background: '#e2e8f0', borderRadius: 4, height: 8 }}>
        <div style={{ width: pct, background: color, borderRadius: 4, height: 8 }} />
      </div>
      <span style={{ fontSize: 13, minWidth: 44, color }}>{(rate * 100).toFixed(1)}%</span>
    </div>
  );
}

function MetricCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ padding: '12px 16px', border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', minWidth: 130 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#0f172a' }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function applyFilter(metrics: RouteReliabilityMetric[], filter: RouteFilter): RouteReliabilityMetric[] {
  return metrics.filter((m) => {
    if (filter.sourceChain && m.sourceChain !== filter.sourceChain) return false;
    if (filter.destinationChain && m.destinationChain !== filter.destinationChain) return false;
    if (filter.asset && m.asset !== filter.asset) return false;
    if (filter.minSuccessRate !== undefined && m.successRate < filter.minSuccessRate) return false;
    return true;
  });
}

export default function RouteReliabilityDashboard() {
  const [metrics] = useState<RouteReliabilityMetric[]>(MOCK_METRICS);
  const [filter, setFilter] = useState<RouteFilter>({});

  const filtered = applyFilter(metrics, filter);
  const avgSuccessRate =
    filtered.length > 0
      ? filtered.reduce((s, m) => s + m.successRate, 0) / filtered.length
      : 0;
  const totalTransfers = filtered.reduce((s, m) => s + m.totalTransfers, 0);
  const bestRoute =
    filtered.length > 0
      ? filtered.reduce((best, m) => (m.successRate > best.successRate ? m : best))
      : null;

  const chains = Array.from(new Set(metrics.flatMap((m) => [m.sourceChain, m.destinationChain])));
  const assets = Array.from(new Set(metrics.map((m) => m.asset)));

  return (
    <div style={{ padding: 24, fontFamily: 'system-ui, sans-serif', maxWidth: 1000, margin: '0 auto' }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>
        Route Reliability Dashboard
      </h1>
      <p style={{ color: '#64748b', marginBottom: 24 }}>
        Stellar cross-chain route performance and reliability metrics.
      </p>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 24 }}>
        <select
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
          value={filter.sourceChain ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, sourceChain: e.target.value || undefined }))}
        >
          <option value="">All source chains</option>
          {chains.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
          value={filter.destinationChain ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, destinationChain: e.target.value || undefined }))}
        >
          <option value="">All destination chains</option>
          {chains.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13 }}
          value={filter.asset ?? ''}
          onChange={(e) => setFilter((f) => ({ ...f, asset: e.target.value || undefined }))}
        >
          <option value="">All assets</option>
          {assets.map((a) => (
            <option key={a} value={a}>{a}</option>
          ))}
        </select>
        <button
          style={{ padding: '6px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, cursor: 'pointer', background: '#fff' }}
          onClick={() => setFilter({})}
          type="button"
        >
          Clear filters
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 32 }}>
        <MetricCard label="Routes shown" value={String(filtered.length)} />
        <MetricCard label="Avg success rate" value={(avgSuccessRate * 100).toFixed(1) + '%'} />
        <MetricCard label="Total transfers" value={totalTransfers.toLocaleString()} />
        {bestRoute && (
          <MetricCard
            label="Best route"
            value={(bestRoute.successRate * 100).toFixed(1) + '%'}
            sub={bestRoute.sourceChain + ' to ' + bestRoute.destinationChain}
          />
        )}
      </div>

      <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', background: '#f1f5f9', borderBottom: '1px solid #e2e8f0' }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#1e293b' }}>Route Metrics</h2>
        </div>
        {filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>No routes match the filters.</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                {['Route', 'Asset', 'Success Rate', 'Avg Latency', 'P95 Latency', 'Transfers', 'Failures'].map(
                  (h) => (
                    <th
                      key={h}
                      style={{
                        padding: '10px 12px',
                        textAlign: 'left',
                        fontSize: 13,
                        color: '#64748b',
                        fontWeight: 600,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.routeId} style={{ borderTop: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '10px 12px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                    {m.sourceChain} to {m.destinationChain}
                  </td>
                  <td style={{ padding: '10px 12px' }}>{m.asset}</td>
                  <td style={{ padding: '10px 12px', minWidth: 160 }}>
                    <ReliabilityBar rate={m.successRate} />
                  </td>
                  <td style={{ padding: '10px 12px' }}>{(m.avgLatencyMs / 1000).toFixed(1)} s</td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>{(m.p95LatencyMs / 1000).toFixed(1)} s</td>
                  <td style={{ padding: '10px 12px' }}>{m.totalTransfers.toLocaleString()}</td>
                  <td style={{ padding: '10px 12px', color: '#ef4444' }}>{m.failureCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: '#94a3b8' }}>
        Data refreshes every 60 seconds in production.
      </p>
    </div>
  );
}
