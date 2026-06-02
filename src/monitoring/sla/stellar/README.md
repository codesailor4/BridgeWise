/**
 * Stellar Bridge SLA Monitoring - Implementation Guide
 */

# Stellar Bridge SLA Monitoring

## Overview

The Stellar Bridge SLA (Service Level Agreement) Monitoring system provides comprehensive tracking and reporting of bridge provider performance metrics, including uptime, latency, and reliability measurements.

## Features

✅ **Uptime Tracking** - Monitor bridge provider availability  
✅ **Latency Monitoring** - Track response times with percentile calculations  
✅ **Reliability Scoring** - Calculate reliability scores based on request success rates  
✅ **SLA Compliance Checking** - Detect violations against configured thresholds  
✅ **Report Generation** - Generate reports in multiple formats (text, JSON, CSV, HTML)  
✅ **Historical Data Storage** - Maintain historical metrics for trend analysis  
✅ **Anomaly Detection** - Identify unusual latency spikes  
✅ **Event Emitters** - Real-time event notifications for violations and status changes

## Installation

The SLA monitoring module is located at `src/monitoring/sla/stellar/` and can be imported as:

```typescript
import {
  StellarBridgeSlaMonitor,
  exportReport,
  calculateComplianceScore,
} from '@/monitoring/sla/stellar';
```

## Quick Start

### 1. Create a Monitor Instance

```typescript
import { StellarBridgeSlaMonitor } from '@/monitoring/sla/stellar';

const monitor = new StellarBridgeSlaMonitor({
  checkIntervalMs: 60_000, // Check every minute
  timeoutMs: 5_000,        // 5-second timeout
  thresholds: {
    uptimePercentage: 99.9,
    maxLatencyMs: 1000,
    minReliability: 0.95,
  },
  autoReportGeneration: true,
  reportIntervalMs: 86_400_000, // Daily reports
  enableHistoricalData: true,
});
```

### 2. Register Providers

```typescript
// Define probe functions that test provider health
const stellarBridgeProbe = async () => {
  const startTime = performance.now();
  try {
    const response = await fetch('https://stellar-bridge-api.example.com/health');
    const latencyMs = performance.now() - startTime;
    return {
      success: response.ok,
      latencyMs,
      error: !response.ok ? 'Health check failed' : undefined,
    };
  } catch (error) {
    return {
      success: false,
      latencyMs: performance.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

monitor.registerProvider('stellar-bridge-primary', stellarBridgeProbe);
monitor.registerProvider('stellar-bridge-backup', backupBridgeProbe);
```

### 3. Start Monitoring

```typescript
monitor.startMonitoring();

// Listen for violations
monitor.on('violation', ({ violation, providerId }) => {
  console.log(`SLA Violation on ${providerId}:`, violation);
  // Send alerts, notifications, etc.
});

// Listen for status changes
monitor.on('status-change', (status) => {
  console.log(`Status changed for ${status.providerId}:`, status.status);
});

// Listen for generated reports
monitor.on('report-generated', (report) => {
  console.log(`Report generated for ${report.providerId}`);
  // Save report, send email, etc.
});
```

### 4. Retrieve Metrics and Reports

```typescript
// Get current metrics for a provider
const metrics = monitor.getMetrics('stellar-bridge-primary');
console.log(`Uptime: ${metrics?.uptime}%`);
console.log(`P99 Latency: ${metrics?.p99LatencyMs}ms`);

// Get status
const status = monitor.getStatus('stellar-bridge-primary');
console.log(`Compliance Status: ${status?.status}`);

// Generate a report
const report = monitor.generateReport('stellar-bridge-primary');

// Export in different formats
import { exportReport } from '@/monitoring/sla/stellar';

const textReport = exportReport(report, 'text');
const jsonReport = exportReport(report, 'json');
const csvReport = exportReport(report, 'csv');
const htmlReport = exportReport(report, 'html');
```

## API Reference

### StellarBridgeSlaMonitor

#### Constructor

```typescript
constructor(config: StellarBridgeSlaMonitorConfig)
```

**Config Options:**
- `checkIntervalMs` (default: 60,000) - Interval between provider checks
- `timeoutMs` (default: 5,000) - Timeout for probe execution
- `maxMeasurements` (default: 10,000) - Max measurements to keep in memory
- `thresholds` - SLA thresholds for compliance
- `autoReportGeneration` (default: true) - Auto-generate reports
- `reportIntervalMs` (default: 86,400,000) - Report generation interval
- `enableHistoricalData` (default: true) - Store historical data
- `onViolation` - Callback for violations
- `onStatusChange` - Callback for status changes
- `onError` - Error handler

#### Methods

```typescript
// Provider Management
registerProvider(providerId: string, probe: SLAProbe): void
unregisterProvider(providerId: string): boolean

// Monitoring Control
startMonitoring(): void
stopMonitoring(): void
reset(): void

// Probe Execution
checkAll(): Promise<void>
checkProvider(providerId: string): Promise<SLAMeasurement | null>

// Data Retrieval
getStatus(providerId: string): SLAStatus | null
getAllStatuses(): SLAStatus[]
getMetrics(providerId: string): Partial<SLAMetrics> | null
getHistoricalData(providerId: string): SLAHistoricalData | null

// Report Generation
generateReport(providerId: string): SLAReport | null
generateAllReports(): Promise<SLAReport[]>

// Historical Data
addHistoricalDailyMetrics(providerId: string, date: Date, metrics: Partial<SLAMetrics>): void
```

#### Events

```typescript
monitor.on('status-change', (status: SLAStatus) => {})
monitor.on('violation', ({ violation, providerId }) => {})
monitor.on('report-generated', (report: SLAReport) => {})
```

### Utility Functions

#### Metrics Utilities

```typescript
import {
  calculatePercentile,
  calculateMovingAverage,
  calculateStandardDeviation,
  detectAnomalies,
  calculateComplianceScore,
  calculateMetricsTrend,
  formatMetricsForDisplay,
  aggregateMetrics,
  checkSlaCompliance,
} from '@/monitoring/sla/stellar';

// Calculate P95 and P99 latencies
const p95 = calculatePercentile(latencies, 95);
const p99 = calculatePercentile(latencies, 99);

// Detect anomalies
const anomalies = detectAnomalies(measurements, 2); // Z-score threshold

// Calculate compliance score (0-100)
const score = calculateComplianceScore(metrics, thresholds);

// Check if compliant
const isCompliant = checkSlaCompliance(metrics, thresholds);
```

#### Report Generation

```typescript
import { exportReport } from '@/monitoring/sla/stellar';

const textReport = exportReport(report, 'text');    // Plain text
const jsonReport = exportReport(report, 'json');    // JSON
const csvReport = exportReport(report, 'csv');      // CSV data
const htmlReport = exportReport(report, 'html');    // HTML document
```

## Examples

### Example 1: Basic Setup with Horizon Health Checks

```typescript
import { StellarBridgeSlaMonitor } from '@/monitoring/sla/stellar';

const monitor = new StellarBridgeSlaMonitor({
  checkIntervalMs: 30_000,
  thresholds: {
    uptimePercentage: 99.5,
    maxLatencyMs: 800,
    minReliability: 0.98,
  },
});

// Probe Stellar Horizon
const horizonProbe = async () => {
  const startTime = performance.now();
  try {
    const response = await fetch('https://horizon.stellar.org/');
    return {
      success: response.ok,
      latencyMs: performance.now() - startTime,
    };
  } catch (error) {
    return {
      success: false,
      latencyMs: performance.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

monitor.registerProvider('stellar-public', horizonProbe);
monitor.startMonitoring();
```

### Example 2: Custom Alerts

```typescript
monitor.on('violation', ({ violation, providerId }) => {
  if (violation.severity === 'critical') {
    // Send critical alert
    console.error(`🚨 CRITICAL: ${providerId} - ${violation.metric} violation!`);
    sendSlackAlert(`Critical SLA violation on ${providerId}`);
    escalateToOncall(providerId, violation);
  } else {
    // Send warning
    console.warn(`⚠️ WARNING: ${providerId} - ${violation.metric} at risk`);
    sendEmailNotification(`SLA warning on ${providerId}`);
  }
});

monitor.on('status-change', ({ providerId, previousStatus, currentStatus }) => {
  if (previousStatus === 'compliant' && currentStatus === 'breached') {
    logIncident(providerId, 'SLA Breached');
  } else if (currentStatus === 'compliant' && previousStatus !== 'compliant') {
    resolveIncident(providerId);
  }
});
```

### Example 3: Generating and Storing Reports

```typescript
import { exportReport } from '@/monitoring/sla/stellar';
import fs from 'fs/promises';

monitor.on('report-generated', async (report) => {
  const date = new Date().toISOString().split('T')[0];
  const dir = `./sla-reports/${report.providerId}`;

  await fs.mkdir(dir, { recursive: true });

  // Save all formats
  await fs.writeFile(
    `${dir}/${date}-report.txt`,
    exportReport(report, 'text'),
  );
  await fs.writeFile(
    `${dir}/${date}-report.json`,
    exportReport(report, 'json'),
  );
  await fs.writeFile(
    `${dir}/${date}-report.csv`,
    exportReport(report, 'csv'),
  );
  await fs.writeFile(
    `${dir}/${date}-report.html`,
    exportReport(report, 'html'),
  );

  console.log(`Reports saved for ${report.providerId} on ${date}`);
});
```

### Example 4: Trend Analysis

```typescript
import { calculateMetricsTrend } from '@/monitoring/sla/stellar';

let previousMetrics = null;

setInterval(() => {
  const currentMetrics = monitor.getMetrics('stellar-bridge-primary');
  
  if (previousMetrics && currentMetrics) {
    const trend = calculateMetricsTrend(currentMetrics, previousMetrics);
    
    console.log('Trend Analysis:');
    console.log(`  Uptime trend: ${trend.uptimeTrend > 0 ? '📈' : '📉'} ${trend.uptimeTrend.toFixed(2)}%`);
    console.log(`  Latency trend: ${trend.latencyTrend < 0 ? '📈' : '📉'} ${trend.latencyTrend.toFixed(0)}ms`);
    console.log(`  Reliability trend: ${trend.reliabilityTrend > 0 ? '📈' : '📉'} ${(trend.reliabilityTrend * 100).toFixed(2)}%`);
  }
  
  previousMetrics = currentMetrics;
}, 300_000); // Every 5 minutes
```

## SLA Thresholds Configuration

Recommended thresholds for production Stellar bridges:

```typescript
const productionThresholds = {
  uptimePercentage: 99.95,      // 99.95% uptime
  maxLatencyMs: 500,             // 500ms max P99 latency
  minReliability: 0.9995,        // 99.95% reliability
  minThroughput: 100,            // 100 requests/second minimum
};

const stagingThresholds = {
  uptimePercentage: 99.5,        // 99.5% uptime
  maxLatencyMs: 1000,            // 1000ms max P99 latency
  minReliability: 0.99,          // 99% reliability
  minThroughput: 50,             // 50 requests/second minimum
};
```

## Testing

Run the test suite:

```bash
npm run test src/monitoring/sla/stellar
```

Tests are located in `src/monitoring/sla/stellar/__tests__/`

## Performance Considerations

- **Memory Usage**: Stores up to `maxMeasurements` per provider (default 10,000)
- **CPU Usage**: Check interval and timeout affect CPU load
- **Network**: Probe functions should be efficient to minimize network impact
- **Scalability**: Can monitor up to hundreds of providers with minimal overhead

## Troubleshooting

### Reports Not Generating
- Ensure `autoReportGeneration: true` in config
- Check that providers have recorded measurements
- Verify `reportIntervalMs` is appropriate

### Violations Not Detected
- Confirm thresholds are set in config
- Check measurement data is being recorded
- Verify violation callbacks are registered

### High Memory Usage
- Reduce `maxMeasurements` value
- Increase frequency of archiving historical data
- Monitor fewer providers simultaneously

## Integration with BridgeWise

To integrate SLA monitoring into the BridgeWise platform:

1. Import the monitor in your bridge provider service
2. Register all bridge providers with their health check probes
3. Connect event handlers to your logging/alerting systems
4. Expose SLA endpoints via REST API
5. Display metrics in monitoring dashboard

Example integration:

```typescript
import { StellarBridgeSlaMonitor } from '@/monitoring/sla/stellar';
import { BridgeProviderManager } from '@/packages/bridge-providers';

export function setupSlaMonitoring() {
  const monitor = new StellarBridgeSlaMonitor(getSlaConfig());
  const providers = BridgeProviderManager.getInstance();

  // Register all providers
  for (const [name, provider] of providers.getAll()) {
    monitor.registerProvider(name, createProbe(provider));
  }

  monitor.startMonitoring();
  return monitor;
}
```
