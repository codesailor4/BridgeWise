/**
 * SLA Metrics Collection Utilities
 * Helper functions for collecting and aggregating SLA metrics
 */

import type {
  SLAMetrics,
  SLAMeasurement,
  SLAThresholds,
} from './types';

/**
 * Calculate percentile from sorted array
 */
export function calculatePercentile(
  values: number[],
  percentile: number,
): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return values[0];

  const sorted = [...values].sort((a, b) => a - b);
  const index = (percentile / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;

  if (lower === upper) {
    return sorted[lower];
  }

  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

/**
 * Calculate moving average of latencies
 */
export function calculateMovingAverage(
  measurements: SLAMeasurement[],
  windowSize: number = 100,
): number {
  if (measurements.length === 0) return 0;

  const recentMeasurements = measurements.slice(-windowSize);
  const latencies = recentMeasurements
    .filter((m) => m.available)
    .map((m) => m.latencyMs);

  if (latencies.length === 0) return 0;

  return latencies.reduce((a, b) => a + b, 0) / latencies.length;
}

/**
 * Calculate standard deviation of latencies
 */
export function calculateStandardDeviation(
  measurements: SLAMeasurement[],
): number {
  const latencies = measurements
    .filter((m) => m.available)
    .map((m) => m.latencyMs);

  if (latencies.length < 2) return 0;

  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const variance =
    latencies.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
    latencies.length;

  return Math.sqrt(variance);
}

/**
 * Detect anomalies in measurements using z-score method
 */
export function detectAnomalies(
  measurements: SLAMeasurement[],
  threshold: number = 2,
): SLAMeasurement[] {
  const latencies = measurements
    .filter((m) => m.available)
    .map((m) => m.latencyMs);

  if (latencies.length < 2) return [];

  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const stdDev = calculateStandardDeviation(measurements);

  if (stdDev === 0) return [];

  return measurements.filter((measurement) => {
    if (!measurement.available) return false;
    const zScore = Math.abs((measurement.latencyMs - mean) / stdDev);
    return zScore > threshold;
  });
}

/**
 * Calculate SLA compliance score (0-100)
 */
export function calculateComplianceScore(
  metrics: Partial<SLAMetrics>,
  thresholds: SLAThresholds,
): number {
  let score = 100;

  // Deduct points for uptime violation
  if (
    metrics.uptime !== undefined &&
    metrics.uptime < thresholds.uptimePercentage
  ) {
    const uptimeDiff = thresholds.uptimePercentage - metrics.uptime;
    score -= Math.min(uptimeDiff * 10, 40); // Max 40 points deduction
  }

  // Deduct points for latency violation
  if (
    metrics.p99LatencyMs !== undefined &&
    metrics.p99LatencyMs > thresholds.maxLatencyMs
  ) {
    const latencyRatio = metrics.p99LatencyMs / thresholds.maxLatencyMs;
    score -= Math.min((latencyRatio - 1) * 20, 30); // Max 30 points deduction
  }

  // Deduct points for reliability violation
  if (
    metrics.reliability !== undefined &&
    metrics.reliability < thresholds.minReliability
  ) {
    const reliabilityDiff = thresholds.minReliability - metrics.reliability;
    score -= Math.min(reliabilityDiff * 100, 30); // Max 30 points deduction
  }

  return Math.max(0, score);
}

/**
 * Calculate trends in metrics
 */
export function calculateMetricsTrend(
  current: Partial<SLAMetrics>,
  previous: Partial<SLAMetrics>,
): {
  uptimeTrend: number;
  latencyTrend: number;
  reliabilityTrend: number;
} {
  return {
    uptimeTrend: current.uptime && previous.uptime ? current.uptime - previous.uptime : 0,
    latencyTrend:
      current.avgLatencyMs && previous.avgLatencyMs
        ? current.avgLatencyMs - previous.avgLatencyMs
        : 0,
    reliabilityTrend:
      current.reliability && previous.reliability
        ? current.reliability - previous.reliability
        : 0,
  };
}

/**
 * Format metrics for display
 */
export function formatMetricsForDisplay(metrics: Partial<SLAMetrics>): Record<string, string> {
  return {
    uptime: `${(metrics.uptime || 0).toFixed(2)}%`,
    availability: `${((metrics.availability || 0) * 100).toFixed(2)}%`,
    avgLatency: `${(metrics.avgLatencyMs || 0).toFixed(2)}ms`,
    p99Latency: `${(metrics.p99LatencyMs || 0).toFixed(2)}ms`,
    p95Latency: `${(metrics.p95LatencyMs || 0).toFixed(2)}ms`,
    minLatency: `${(metrics.minLatencyMs || 0).toFixed(2)}ms`,
    maxLatency: `${(metrics.maxLatencyMs || 0).toFixed(2)}ms`,
    totalRequests: `${metrics.totalRequests || 0}`,
    successfulRequests: `${metrics.successfulRequests || 0}`,
    failedRequests: `${metrics.failedRequests || 0}`,
    reliability: `${((metrics.reliability || 0) * 100).toFixed(2)}%`,
  };
}

/**
 * Aggregate metrics from multiple measurement periods
 */
export function aggregateMetrics(
  metricsList: Array<Partial<SLAMetrics>>,
): Partial<SLAMetrics> {
  if (metricsList.length === 0) {
    return {
      uptime: 0,
      availability: 0,
      avgLatencyMs: 0,
      p99LatencyMs: 0,
      p95LatencyMs: 0,
      minLatencyMs: 0,
      maxLatencyMs: 0,
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      reliability: 0,
    };
  }

  const totalRequests = metricsList.reduce((sum, m) => sum + (m.totalRequests || 0), 0);
  const totalSuccessful = metricsList.reduce(
    (sum, m) => sum + (m.successfulRequests || 0),
    0,
  );
  const totalFailed = metricsList.reduce((sum, m) => sum + (m.failedRequests || 0), 0);

  const availability = totalRequests > 0 ? totalSuccessful / totalRequests : 0;
  const uptime = availability * 100;
  const reliability = availability;

  const avgLatencies = metricsList
    .map((m) => m.avgLatencyMs || 0)
    .filter((v) => v > 0);
  const avgLatencyMs = avgLatencies.length > 0
    ? avgLatencies.reduce((a, b) => a + b, 0) / avgLatencies.length
    : 0;

  const p99Latencies = metricsList
    .map((m) => m.p99LatencyMs || 0)
    .filter((v) => v > 0);
  const p99LatencyMs = p99Latencies.length > 0
    ? Math.max(...p99Latencies)
    : 0;

  const p95Latencies = metricsList
    .map((m) => m.p95LatencyMs || 0)
    .filter((v) => v > 0);
  const p95LatencyMs = p95Latencies.length > 0
    ? Math.max(...p95Latencies)
    : 0;

  const minLatencies = metricsList
    .map((m) => m.minLatencyMs || 0)
    .filter((v) => v > 0);
  const minLatencyMs = minLatencies.length > 0
    ? Math.min(...minLatencies)
    : 0;

  const maxLatencies = metricsList
    .map((m) => m.maxLatencyMs || 0)
    .filter((v) => v > 0);
  const maxLatencyMs = maxLatencies.length > 0
    ? Math.max(...maxLatencies)
    : 0;

  return {
    uptime,
    availability,
    avgLatencyMs,
    p99LatencyMs,
    p95LatencyMs,
    minLatencyMs,
    maxLatencyMs,
    totalRequests,
    successfulRequests: totalSuccessful,
    failedRequests: totalFailed,
    reliability,
  };
}

/**
 * Check if metrics meet SLA thresholds
 */
export function checkSlaCompliance(
  metrics: Partial<SLAMetrics>,
  thresholds: SLAThresholds,
): boolean {
  return (
    (metrics.uptime === undefined || metrics.uptime >= thresholds.uptimePercentage) &&
    (metrics.p99LatencyMs === undefined ||
      metrics.p99LatencyMs <= thresholds.maxLatencyMs) &&
    (metrics.reliability === undefined ||
      metrics.reliability >= thresholds.minReliability) &&
    true // throughput check could be added here
  );
}

/**
 * Calculate expected recovery time based on current trend
 */
export function estimateRecoveryTime(
  violations: number,
  trend: number,
  threshold: number,
): number | null {
  if (violations === 0 || trend === 0 || trend >= 0) {
    return null; // Not recovering or already recovered
  }

  // Estimate time to recover based on negative trend
  const improvementNeeded = violations - threshold;
  if (improvementNeeded <= 0) {
    return 0; // Already at threshold
  }

  // Rough estimate: time = improvement needed / rate of improvement
  const estimatedMinutes = Math.ceil(Math.abs(improvementNeeded / trend));
  return estimatedMinutes * 60 * 1000; // Convert to milliseconds
}
