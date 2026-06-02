/**
 * Stellar Bridge SLA Monitoring Types
 * Defines types and interfaces for tracking service level agreements
 */

export type SLAMetric = 'uptime' | 'latency' | 'throughput' | 'reliability';

export interface SLAThresholds {
  /** Minimum uptime percentage (0-100). Default: 99.9 */
  uptimePercentage?: number;
  /** Maximum acceptable latency in milliseconds. Default: 1000 */
  maxLatencyMs?: number;
  /** Minimum reliability score (0-1). Default: 0.95 */
  minReliability?: number;
  /** Minimum throughput (requests per second). Default: 100 */
  minThroughput?: number;
}

export interface SLAMeasurement {
  timestamp: Date;
  available: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface SLAMetrics {
  providerId: string;
  period: {
    startTime: Date;
    endTime: Date;
  };
  measurements: SLAMeasurement[];
  uptime: number; // 0-100 percentage
  availability: number; // 0-1
  avgLatencyMs: number;
  p99LatencyMs: number;
  p95LatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  reliability: number; // 0-1
}

export interface SLAStatus {
  providerId: string;
  status: 'compliant' | 'at-risk' | 'breached';
  metricsSnapshot: Partial<SLAMetrics>;
  violations: SLAViolation[];
  lastUpdated: Date;
}

export interface SLAViolation {
  metric: SLAMetric;
  threshold: number;
  actual: number;
  violatedAt: Date;
  severity: 'warning' | 'critical';
}

export interface SLAReport {
  reportId: string;
  providerId: string;
  generatedAt: Date;
  period: {
    startTime: Date;
    endTime: Date;
  };
  metrics: SLAMetrics;
  status: SLAStatus['status'];
  violations: SLAViolation[];
  summary: string;
  recommendations: string[];
}

export interface SLAHistoricalData {
  providerId: string;
  dailyMetrics: Array<{
    date: Date;
    metrics: Partial<SLAMetrics>;
  }>;
  monthlyMetrics: Array<{
    month: Date;
    metrics: Partial<SLAMetrics>;
  }>;
  yearlyMetrics: Array<{
    year: number;
    metrics: Partial<SLAMetrics>;
  }>;
}

export interface StellarBridgeSlaMonitorConfig {
  /** Check interval in milliseconds. Default: 60000 (1 minute) */
  checkIntervalMs?: number;
  /** Timeout for probe calls in milliseconds. Default: 5000 */
  timeoutMs?: number;
  /** Number of measurements to keep in memory. Default: 10000 */
  maxMeasurements?: number;
  /** SLA thresholds for compliance checking */
  thresholds?: SLAThresholds;
  /** Enable automatic report generation */
  autoReportGeneration?: boolean;
  /** Report generation interval in milliseconds. Default: 86400000 (24 hours) */
  reportIntervalMs?: number;
  /** Enable historical data storage */
  enableHistoricalData?: boolean;
  /** Callback when SLA violation occurs */
  onViolation?: (violation: SLAViolation, providerId: string) => void;
  /** Callback when SLA status changes */
  onStatusChange?: (status: SLAStatus) => void;
  /** Error handler for unhandled errors */
  onError?: (err: unknown) => void;
}

export type SLAProbe = () => Promise<{
  success: boolean;
  latencyMs: number;
  error?: string;
}>;
