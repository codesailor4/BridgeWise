/**
 * Stellar cross-chain metrics exporter (#391).
 *
 * Collects per-route bridge metrics and serialises them in Prometheus text
 * exposition format so external observability stacks (Prometheus, Grafana,
 * VictoriaMetrics, etc.) can scrape them via the standard `/metrics` endpoint.
 *
 * The exporter is intentionally provider-agnostic: callers feed it events
 * (`recordTransaction`, `recordLatency`, etc.) and it tracks counters,
 * gauges, and histograms.
 */

export type MetricLabels = Record<string, string>;

interface Counter {
  type: 'counter';
  help: string;
  values: Map<string, number>;
}

interface Gauge {
  type: 'gauge';
  help: string;
  values: Map<string, number>;
}

interface Histogram {
  type: 'histogram';
  help: string;
  buckets: number[];
  observations: Map<
    string,
    { bucketCounts: number[]; sum: number; count: number }
  >;
}

type Metric = Counter | Gauge | Histogram;

const DEFAULT_LATENCY_BUCKETS_MS = [
  50, 100, 250, 500, 1_000, 2_500, 5_000, 10_000, 30_000,
];

function serialiseLabels(labels: MetricLabels): string {
  const entries = Object.entries(labels);
  if (entries.length === 0) return '';
  return entries
    .map(
      ([k, v]) =>
        `${k}="${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n')}"`,
    )
    .join(',');
}

function labelKey(labels: MetricLabels): string {
  return Object.keys(labels)
    .sort()
    .map((k) => `${k}=${labels[k]}`)
    .join('|');
}

export class StellarMetricsExporter {
  private readonly metrics = new Map<string, Metric>();
  private readonly namespace: string;

  constructor(namespace = 'bridgewise_stellar') {
    this.namespace = namespace;
    this.registerDefaults();
  }

  private registerDefaults(): void {
    this.registerCounter(
      'transactions_total',
      'Total Stellar bridge transactions, partitioned by outcome',
    );
    this.registerCounter(
      'transaction_failures_total',
      'Total failed Stellar bridge transactions',
    );
    this.registerGauge(
      'active_routes',
      'Currently active Stellar bridge routes',
    );
    this.registerGauge('liquidity_usd', 'Available liquidity per route in USD');
    this.registerHistogram(
      'transaction_latency_ms',
      'Stellar bridge transaction latency in milliseconds',
      DEFAULT_LATENCY_BUCKETS_MS,
    );
    this.registerHistogram(
      'fee_usd',
      'Fee per transaction in USD',
      [0.01, 0.05, 0.1, 0.25, 0.5, 1, 5, 10, 50],
    );
    this.registerCounter(
      'wallet_connections_total',
      'Total Stellar wallet connections',
    );
    this.registerCounter(
      'wallet_connection_failures_total',
      'Total Stellar wallet connection failures',
    );
    this.registerCounter(
      'wallet_disconnects_total',
      'Total Stellar wallet disconnections',
    );
    this.registerGauge(
      'wallet_active_connections',
      'Number of active Stellar wallet connections',
    );
    this.registerGauge(
      'wallet_health_status',
      'Health status of Stellar wallets (1 = healthy, 0 = unhealthy/disconnected)',
    );
    this.registerHistogram(
      'wallet_ping_latency_ms',
      'Stellar wallet ping latency in milliseconds',
      [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    );
  }

  // ── Metric registration ──────────────────────────────────────────────────

  private registerCounter(name: string, help: string): void {
    this.metrics.set(name, { type: 'counter', help, values: new Map() });
  }

  private registerGauge(name: string, help: string): void {
    this.metrics.set(name, { type: 'gauge', help, values: new Map() });
  }

  private registerHistogram(
    name: string,
    help: string,
    buckets: number[],
  ): void {
    this.metrics.set(name, {
      type: 'histogram',
      help,
      buckets: [...buckets].sort((a, b) => a - b),
      observations: new Map(),
    });
  }

  // ── Recording API ────────────────────────────────────────────────────────

  recordTransaction(labels: {
    route: string;
    status: 'success' | 'failure' | 'timeout';
  }): void {
    this.incrementCounter('transactions_total', labels);
    if (labels.status !== 'success') {
      this.incrementCounter('transaction_failures_total', {
        route: labels.route,
        reason: labels.status,
      });
    }
  }

  recordLatency(labels: { route: string }, latencyMs: number): void {
    this.observeHistogram('transaction_latency_ms', labels, latencyMs);
  }

  recordFee(labels: { route: string; asset: string }, feeUsd: number): void {
    this.observeHistogram('fee_usd', labels, feeUsd);
  }

  setActiveRoutes(count: number, labels: MetricLabels = {}): void {
    this.setGauge('active_routes', labels, count);
  }

  setLiquidity(labels: { route: string }, liquidityUsd: number): void {
    this.setGauge('liquidity_usd', labels, liquidityUsd);
  }

  recordWalletConnection(walletType: string): void {
    this.incrementCounter('wallet_connections_total', {
      wallet_type: walletType,
    });
  }

  recordWalletConnectionFailure(walletType: string, reason: string): void {
    this.incrementCounter('wallet_connection_failures_total', {
      wallet_type: walletType,
      reason,
    });
  }

  recordWalletDisconnect(walletType: string, reason: string): void {
    this.incrementCounter('wallet_disconnects_total', {
      wallet_type: walletType,
      reason,
    });
  }

  setWalletActiveConnections(walletType: string, count: number): void {
    this.setGauge(
      'wallet_active_connections',
      { wallet_type: walletType },
      count,
    );
  }

  setWalletHealth(walletType: string, address: string, status: 1 | 0): void {
    this.setGauge(
      'wallet_health_status',
      { wallet_type: walletType, address },
      status,
    );
  }

  recordWalletPingLatency(walletType: string, latencyMs: number): void {
    this.observeHistogram(
      'wallet_ping_latency_ms',
      { wallet_type: walletType },
      latencyMs,
    );
  }

  // ── Low-level mutators ───────────────────────────────────────────────────

  private incrementCounter(name: string, labels: MetricLabels, by = 1): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'counter')
      throw new Error(`Unknown counter: ${name}`);
    const key = labelKey(labels);
    metric.values.set(key, (metric.values.get(key) ?? 0) + by);
  }

  private setGauge(name: string, labels: MetricLabels, value: number): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'gauge')
      throw new Error(`Unknown gauge: ${name}`);
    metric.values.set(labelKey(labels), value);
  }

  private observeHistogram(
    name: string,
    labels: MetricLabels,
    value: number,
  ): void {
    const metric = this.metrics.get(name);
    if (!metric || metric.type !== 'histogram')
      throw new Error(`Unknown histogram: ${name}`);
    const key = labelKey(labels);
    let entry = metric.observations.get(key);
    if (!entry) {
      entry = {
        bucketCounts: new Array(metric.buckets.length).fill(0),
        sum: 0,
        count: 0,
      };
      metric.observations.set(key, entry);
    }
    entry.sum += value;
    entry.count += 1;
    for (let i = 0; i < metric.buckets.length; i += 1) {
      if (value <= metric.buckets[i]) entry.bucketCounts[i] += 1;
    }
  }

  /** Reset all metrics. Intended for tests; production callers should not need this. */
  reset(): void {
    for (const metric of this.metrics.values()) {
      if (metric.type === 'counter' || metric.type === 'gauge') {
        metric.values.clear();
      } else {
        metric.observations.clear();
      }
    }
  }

  // ── Serialisation ────────────────────────────────────────────────────────

  /**
   * Render the current metric snapshot as Prometheus text exposition (v0.0.4).
   * Suitable for serving from a `GET /metrics` HTTP endpoint with content type
   * `text/plain; version=0.0.4`.
   */
  toPrometheus(): string {
    const lines: string[] = [];
    for (const [name, metric] of this.metrics) {
      const fullName = `${this.namespace}_${name}`;
      lines.push(`# HELP ${fullName} ${metric.help}`);
      lines.push(`# TYPE ${fullName} ${metric.type}`);

      if (metric.type === 'counter' || metric.type === 'gauge') {
        if (metric.values.size === 0) {
          lines.push(`${fullName} 0`);
        } else {
          for (const [labelStr, value] of metric.values) {
            const labels = labelStr ? `{${this.formatLabelKey(labelStr)}}` : '';
            lines.push(`${fullName}${labels} ${value}`);
          }
        }
      } else {
        // histogram
        for (const [labelStr, obs] of metric.observations) {
          const baseLabels = labelStr ? this.formatLabelKey(labelStr) : '';
          for (let i = 0; i < metric.buckets.length; i += 1) {
            const leLabel = `le="${metric.buckets[i]}"`;
            const labels = baseLabels
              ? `{${baseLabels},${leLabel}}`
              : `{${leLabel}}`;
            lines.push(`${fullName}_bucket${labels} ${obs.bucketCounts[i]}`);
          }
          const infLabel = `le="+Inf"`;
          const labelsInf = baseLabels
            ? `{${baseLabels},${infLabel}}`
            : `{${infLabel}}`;
          lines.push(`${fullName}_bucket${labelsInf} ${obs.count}`);
          const sumLabels = baseLabels ? `{${baseLabels}}` : '';
          lines.push(`${fullName}_sum${sumLabels} ${obs.sum}`);
          lines.push(`${fullName}_count${sumLabels} ${obs.count}`);
        }
      }
    }
    return lines.join('\n') + '\n';
  }

  /**
   * Render the current metric snapshot as plain JSON. Useful for systems
   * that don't speak Prometheus (e.g. OpenTelemetry collectors, custom
   * ingesters, debugging endpoints).
   */
  toJSON(): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [name, metric] of this.metrics) {
      const fullName = `${this.namespace}_${name}`;
      if (metric.type === 'counter' || metric.type === 'gauge') {
        out[fullName] = {
          type: metric.type,
          help: metric.help,
          values: Array.from(metric.values, ([labels, value]) => ({
            labels: this.parseLabelKey(labels),
            value,
          })),
        };
      } else {
        out[fullName] = {
          type: metric.type,
          help: metric.help,
          buckets: metric.buckets,
          observations: Array.from(metric.observations, ([labels, obs]) => ({
            labels: this.parseLabelKey(labels),
            bucketCounts: obs.bucketCounts,
            sum: obs.sum,
            count: obs.count,
          })),
        };
      }
    }
    return out;
  }

  private formatLabelKey(labelStr: string): string {
    const parts = labelStr.split('|').filter(Boolean);
    return parts
      .map((p) => {
        const idx = p.indexOf('=');
        const k = p.slice(0, idx);
        const v = p.slice(idx + 1);
        return `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
      })
      .join(',');
  }

  private parseLabelKey(labelStr: string): MetricLabels {
    if (!labelStr) return {};
    const out: MetricLabels = {};
    for (const p of labelStr.split('|')) {
      if (!p) continue;
      const idx = p.indexOf('=');
      out[p.slice(0, idx)] = p.slice(idx + 1);
    }
    return out;
  }
}

/** Singleton instance for the common case where one exporter is shared app-wide. */
export const stellarMetrics = new StellarMetricsExporter();
