/**
 * Stellar Bridge SLA Monitor
 * Tracks and monitors Service Level Agreements for Stellar bridge providers
 */

import { EventEmitter } from 'events';
import type {
  SLAMetrics,
  SLAStatus,
  SLAViolation,
  SLAReport,
  SLAMeasurement,
  SLAThresholds,
  StellarBridgeSlaMonitorConfig,
  SLAProbe,
  SLAHistoricalData,
} from './types';

const DEFAULT_CONFIG: Required<StellarBridgeSlaMonitorConfig> = {
  checkIntervalMs: 60_000,
  timeoutMs: 5_000,
  maxMeasurements: 10_000,
  thresholds: {
    uptimePercentage: 99.9,
    maxLatencyMs: 1_000,
    minReliability: 0.95,
    minThroughput: 100,
  },
  autoReportGeneration: true,
  reportIntervalMs: 86_400_000, // 24 hours
  enableHistoricalData: true,
  onViolation: undefined,
  onStatusChange: undefined,
  onError: undefined,
};

export class StellarBridgeSlaMonitor extends EventEmitter {
  private readonly config: Required<StellarBridgeSlaMonitorConfig>;
  private readonly probes = new Map<string, SLAProbe>();
  private readonly measurements = new Map<string, SLAMeasurement[]>();
  private readonly slaStatuses = new Map<string, SLAStatus>();
  private readonly historicalData = new Map<string, SLAHistoricalData>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private reportInterval: ReturnType<typeof setInterval> | null = null;
  private lastReportTime = new Map<string, Date>();

  constructor(config: StellarBridgeSlaMonitorConfig = {}) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      thresholds: {
        ...DEFAULT_CONFIG.thresholds,
        ...config.thresholds,
      },
    };

    this.setupErrorHandler();
  }

  /**
   * Register a provider for SLA monitoring
   */
  registerProvider(providerId: string, probe: SLAProbe): void {
    this.probes.set(providerId, probe);
    if (!this.measurements.has(providerId)) {
      this.measurements.set(providerId, []);
    }
    if (!this.slaStatuses.has(providerId)) {
      this.initializeProviderStatus(providerId);
    }
    if (this.config.enableHistoricalData && !this.historicalData.has(providerId)) {
      this.historicalData.set(providerId, {
        providerId,
        dailyMetrics: [],
        monthlyMetrics: [],
        yearlyMetrics: [],
      });
    }
  }

  /**
   * Unregister a provider
   */
  unregisterProvider(providerId: string): boolean {
    this.measurements.delete(providerId);
    this.slaStatuses.delete(providerId);
    this.lastReportTime.delete(providerId);
    return this.probes.delete(providerId);
  }

  /**
   * Start SLA monitoring
   */
  startMonitoring(): void {
    if (this.checkInterval) {
      return;
    }

    this.checkInterval = setInterval(() => {
      void this.checkAll();
    }, this.config.checkIntervalMs);

    if (this.config.autoReportGeneration && !this.reportInterval) {
      this.reportInterval = setInterval(() => {
        void this.generateAllReports();
      }, this.config.reportIntervalMs);
    }

    void this.checkAll();
  }

  /**
   * Stop SLA monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    if (this.reportInterval) {
      clearInterval(this.reportInterval);
      this.reportInterval = null;
    }
  }

  /**
   * Reset all monitoring data
   */
  reset(): void {
    this.stopMonitoring();
    this.probes.clear();
    this.measurements.clear();
    this.slaStatuses.clear();
    this.historicalData.clear();
    this.lastReportTime.clear();
  }

  /**
   * Check all registered providers
   */
  async checkAll(): Promise<void> {
    const providerIds = Array.from(this.probes.keys());
    await Promise.all(providerIds.map((providerId) => this.checkProvider(providerId)));
  }

  /**
   * Check a specific provider
   */
  async checkProvider(providerId: string): Promise<SLAMeasurement | null> {
    const probe = this.probes.get(providerId);
    if (!probe) {
      return null;
    }

    let measurement: SLAMeasurement;
    try {
      const startTime = performance.now();
      const result = await this.withTimeout(probe(), this.config.timeoutMs);
      const latencyMs = performance.now() - startTime;

      measurement = {
        timestamp: new Date(),
        available: result.success,
        latencyMs,
        errorMessage: result.error,
      };
    } catch (error: any) {
      measurement = {
        timestamp: new Date(),
        available: false,
        latencyMs: this.config.timeoutMs,
        errorMessage: error?.message || String(error),
      };
    }

    this.recordMeasurement(providerId, measurement);
    await this.updateStatus(providerId);

    return measurement;
  }

  /**
   * Record a measurement for a provider
   */
  private recordMeasurement(providerId: string, measurement: SLAMeasurement): void {
    const measurements = this.measurements.get(providerId) || [];
    measurements.push(measurement);

    // Keep only the latest measurements within maxMeasurements
    if (measurements.length > this.config.maxMeasurements) {
      measurements.shift();
    }

    this.measurements.set(providerId, measurements);
  }

  /**
   * Update SLA status for a provider
   */
  private async updateStatus(providerId: string): Promise<void> {
    const metrics = this.calculateMetrics(providerId);
    const violations = this.checkViolations(providerId, metrics);
    const previousStatus = this.slaStatuses.get(providerId);

    // Determine compliance status
    let status: SLAStatus['status'] = 'compliant';
    if (violations.length > 0) {
      const criticalViolations = violations.filter((v) => v.severity === 'critical');
      status = criticalViolations.length > 0 ? 'breached' : 'at-risk';
    }

    const newStatus: SLAStatus = {
      providerId,
      status,
      metricsSnapshot: metrics,
      violations,
      lastUpdated: new Date(),
    };

    this.slaStatuses.set(providerId, newStatus);

    // Emit events
    if (previousStatus && previousStatus.status !== newStatus.status) {
      this.emitStatusChange(newStatus);
    }

    // Emit violations
    violations.forEach((violation) => {
      this.emitViolation(violation, providerId);
    });
  }

  /**
   * Calculate metrics from measurements
   */
  private calculateMetrics(providerId: string): Partial<SLAMetrics> {
    const measurements = this.measurements.get(providerId) || [];
    if (measurements.length === 0) {
      return {
        providerId,
        uptime: 100,
        availability: 1,
        avgLatencyMs: 0,
        p99LatencyMs: 0,
        p95LatencyMs: 0,
        minLatencyMs: 0,
        maxLatencyMs: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        reliability: 1,
      };
    }

    const successfulMeasurements = measurements.filter((m) => m.available);
    const latencies = successfulMeasurements.map((m) => m.latencyMs).sort((a, b) => a - b);

    const totalRequests = measurements.length;
    const successfulRequests = successfulMeasurements.length;
    const failedRequests = totalRequests - successfulRequests;
    const availability = successfulRequests / totalRequests;
    const uptime = availability * 100;

    const avgLatencyMs =
      latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    const minLatencyMs = latencies.length > 0 ? latencies[0] : 0;
    const maxLatencyMs = latencies.length > 0 ? latencies[latencies.length - 1] : 0;

    // Calculate percentiles
    const p99Index = Math.ceil((latencies.length * 99) / 100) - 1;
    const p95Index = Math.ceil((latencies.length * 95) / 100) - 1;
    const p99LatencyMs = latencies[Math.max(0, p99Index)] || 0;
    const p95LatencyMs = latencies[Math.max(0, p95Index)] || 0;

    const reliability = availability;

    return {
      providerId,
      uptime,
      availability,
      avgLatencyMs,
      p99LatencyMs,
      p95LatencyMs,
      minLatencyMs,
      maxLatencyMs,
      totalRequests,
      successfulRequests,
      failedRequests,
      reliability,
    };
  }

  /**
   * Check for SLA violations
   */
  private checkViolations(providerId: string, metrics: Partial<SLAMetrics>): SLAViolation[] {
    const violations: SLAViolation[] = [];
    const thresholds = this.config.thresholds;
    const now = new Date();

    // Check uptime
    if (
      metrics.uptime !== undefined &&
      metrics.uptime < thresholds.uptimePercentage
    ) {
      violations.push({
        metric: 'uptime',
        threshold: thresholds.uptimePercentage,
        actual: metrics.uptime,
        violatedAt: now,
        severity:
          metrics.uptime < thresholds.uptimePercentage * 0.95 ? 'critical' : 'warning',
      });
    }

    // Check latency
    if (
      metrics.p99LatencyMs !== undefined &&
      metrics.p99LatencyMs > thresholds.maxLatencyMs
    ) {
      violations.push({
        metric: 'latency',
        threshold: thresholds.maxLatencyMs,
        actual: metrics.p99LatencyMs,
        violatedAt: now,
        severity:
          metrics.p99LatencyMs > thresholds.maxLatencyMs * 2 ? 'critical' : 'warning',
      });
    }

    // Check reliability
    if (
      metrics.reliability !== undefined &&
      metrics.reliability < thresholds.minReliability
    ) {
      violations.push({
        metric: 'reliability',
        threshold: thresholds.minReliability,
        actual: metrics.reliability,
        violatedAt: now,
        severity:
          metrics.reliability < thresholds.minReliability * 0.9 ? 'critical' : 'warning',
      });
    }

    return violations;
  }

  /**
   * Generate a full SLA report for a provider
   */
  generateReport(providerId: string): SLAReport | null {
    const measurements = this.measurements.get(providerId);
    if (!measurements || measurements.length === 0) {
      return null;
    }

    const metrics = this.calculateMetrics(providerId);
    const status = this.slaStatuses.get(providerId);
    const violations = status?.violations || [];

    const startTime = measurements[0].timestamp;
    const endTime = measurements[measurements.length - 1].timestamp;

    const report: SLAReport = {
      reportId: `sla-${providerId}-${Date.now()}`,
      providerId,
      generatedAt: new Date(),
      period: {
        startTime,
        endTime,
      },
      metrics: {
        providerId,
        period: { startTime, endTime },
        measurements,
        ...(metrics as any),
      },
      status: status?.status || 'compliant',
      violations,
      summary: this.generateSummary(providerId, metrics, violations),
      recommendations: this.generateRecommendations(providerId, metrics, violations),
    };

    this.lastReportTime.set(providerId, new Date());
    this.emit('report-generated', report);

    return report;
  }

  /**
   * Generate reports for all providers
   */
  async generateAllReports(): Promise<SLAReport[]> {
    const reports: SLAReport[] = [];
    for (const providerId of this.probes.keys()) {
      const report = this.generateReport(providerId);
      if (report) {
        reports.push(report);
      }
    }
    return reports;
  }

  /**
   * Get current SLA status for a provider
   */
  getStatus(providerId: string): SLAStatus | null {
    return this.slaStatuses.get(providerId) || null;
  }

  /**
   * Get all provider statuses
   */
  getAllStatuses(): SLAStatus[] {
    return Array.from(this.slaStatuses.values());
  }

  /**
   * Get metrics for a provider
   */
  getMetrics(providerId: string): Partial<SLAMetrics> | null {
    const measurements = this.measurements.get(providerId);
    if (!measurements) {
      return null;
    }
    return this.calculateMetrics(providerId);
  }

  /**
   * Get historical data for a provider
   */
  getHistoricalData(providerId: string): SLAHistoricalData | null {
    return this.historicalData.get(providerId) || null;
  }

  /**
   * Add historical daily metrics
   */
  addHistoricalDailyMetrics(
    providerId: string,
    date: Date,
    metrics: Partial<SLAMetrics>,
  ): void {
    const history = this.historicalData.get(providerId);
    if (!history) {
      return;
    }

    history.dailyMetrics.push({
      date,
      metrics,
    });
  }

  /**
   * Private helper methods
   */
  private initializeProviderStatus(providerId: string): void {
    this.slaStatuses.set(providerId, {
      providerId,
      status: 'compliant',
      metricsSnapshot: {},
      violations: [],
      lastUpdated: new Date(),
    });
  }

  private generateSummary(
    providerId: string,
    metrics: Partial<SLAMetrics>,
    violations: SLAViolation[],
  ): string {
    const uptime = metrics.uptime?.toFixed(2) || '0';
    const latency = metrics.avgLatencyMs?.toFixed(0) || '0';
    const reliability = (metrics.reliability || 0).toFixed(3);

    let summary = `Provider "${providerId}" - Uptime: ${uptime}%, Avg Latency: ${latency}ms, Reliability: ${reliability}`;

    if (violations.length > 0) {
      const criticalViolations = violations.filter((v) => v.severity === 'critical').length;
      const warningViolations = violations.filter((v) => v.severity === 'warning').length;
      summary += `. Violations: ${criticalViolations} critical, ${warningViolations} warnings`;
    }

    return summary;
  }

  private generateRecommendations(
    providerId: string,
    metrics: Partial<SLAMetrics>,
    violations: SLAViolation[],
  ): string[] {
    const recommendations: string[] = [];

    if (violations.length === 0) {
      recommendations.push(`Continue monitoring "${providerId}" for consistent performance.`);
      return recommendations;
    }

    for (const violation of violations) {
      if (violation.metric === 'uptime') {
        recommendations.push(
          `Investigate downtime for "${providerId}". Current uptime: ${violation.actual.toFixed(2)}%, threshold: ${violation.threshold.toFixed(2)}%`,
        );
      } else if (violation.metric === 'latency') {
        recommendations.push(
          `Optimize latency for "${providerId}". P99 latency: ${violation.actual.toFixed(0)}ms, threshold: ${violation.threshold}ms`,
        );
      } else if (violation.metric === 'reliability') {
        recommendations.push(
          `Improve reliability for "${providerId}". Current: ${violation.actual.toFixed(3)}, threshold: ${violation.threshold.toFixed(3)}`,
        );
      }
    }

    return recommendations;
  }

  private emitStatusChange(status: SLAStatus): void {
    this.emit('status-change', status);
    if (this.config.onStatusChange) {
      this.config.onStatusChange(status);
    }
  }

  private emitViolation(violation: SLAViolation, providerId: string): void {
    this.emit('violation', { violation, providerId });
    if (this.config.onViolation) {
      this.config.onViolation(violation, providerId);
    }
  }

  private setupErrorHandler(): void {
    this.on('error', (error: unknown) => {
      if (this.config.onError) {
        this.config.onError(error);
      }
    });
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`SLA probe timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then((value) => {
          clearTimeout(timeout);
          resolve(value);
        })
        .catch((error) => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }
}
