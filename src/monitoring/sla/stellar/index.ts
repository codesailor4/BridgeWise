/**
 * Stellar Bridge SLA Monitoring Module
 * Main export for SLA monitoring functionality
 */

export {
  StellarBridgeSlaMonitor,
} from './stellar-bridge-sla-monitor';

export {
  calculatePercentile,
  calculateMovingAverage,
  calculateStandardDeviation,
  detectAnomalies,
  calculateComplianceScore,
  calculateMetricsTrend,
  formatMetricsForDisplay,
  aggregateMetrics,
  checkSlaCompliance,
  estimateRecoveryTime,
} from './metrics-utils';

export {
  generateTextReport,
  generateJsonReport,
  generateCsvReport,
  generateHtmlReport,
  exportReport,
} from './report-generator';

export type {
  SLAMetric,
  SLAThresholds,
  SLAMeasurement,
  SLAMetrics,
  SLAStatus,
  SLAViolation,
  SLAReport,
  SLAHistoricalData,
  StellarBridgeSlaMonitorConfig,
  SLAProbe,
} from './types';
