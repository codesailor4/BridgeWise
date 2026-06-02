/**
 * SLA Report Generator
 * Utilities for generating SLA reports
 */

import type {
  SLAReport,
  SLAMetrics,
  SLAViolation,
} from './types';
import {
  formatMetricsForDisplay,
  calculateComplianceScore,
} from './metrics-utils';

/**
 * Generate a detailed text report
 */
export function generateTextReport(report: SLAReport): string {
  const lines: string[] = [];

  lines.push('╔═══════════════════════════════════════════════════════════════╗');
  lines.push('║           STELLAR BRIDGE SLA REPORT                          ║');
  lines.push('╚═══════════════════════════════════════════════════════════════╝');
  lines.push('');

  lines.push('📋 REPORT METADATA');
  lines.push(`  Report ID:     ${report.reportId}`);
  lines.push(`  Provider:      ${report.providerId}`);
  lines.push(`  Generated:     ${report.generatedAt.toISOString()}`);
  lines.push(`  Period:        ${report.period.startTime.toISOString()} to ${report.period.endTime.toISOString()}`);
  lines.push('');

  lines.push('📊 PERFORMANCE METRICS');
  const formatted = formatMetricsForDisplay(report.metrics);
  lines.push(`  Uptime:        ${formatted.uptime}`);
  lines.push(`  Availability:  ${formatted.availability}`);
  lines.push(`  Avg Latency:   ${formatted.avgLatency}`);
  lines.push(`  P99 Latency:   ${formatted.p99Latency}`);
  lines.push(`  P95 Latency:   ${formatted.p95Latency}`);
  lines.push(`  Min Latency:   ${formatted.minLatency}`);
  lines.push(`  Max Latency:   ${formatted.maxLatency}`);
  lines.push(`  Total Requests:      ${formatted.totalRequests}`);
  lines.push(`  Successful Requests: ${formatted.successfulRequests}`);
  lines.push(`  Failed Requests:     ${formatted.failedRequests}`);
  lines.push(`  Reliability:   ${formatted.reliability}`);
  lines.push('');

  lines.push('✅ SLA STATUS');
  const statusEmoji =
    report.status === 'compliant'
      ? '✓'
      : report.status === 'at-risk'
        ? '⚠'
        : '✗';
  const statusLabel =
    report.status === 'compliant'
      ? 'COMPLIANT'
      : report.status === 'at-risk'
        ? 'AT-RISK'
        : 'BREACHED';
  lines.push(`  Status:        ${statusEmoji} ${statusLabel}`);
  lines.push('');

  if (report.violations.length > 0) {
    lines.push('⚠️  VIOLATIONS');
    report.violations.forEach((violation, index) => {
      const severity = violation.severity === 'critical' ? '🔴' : '🟡';
      lines.push(`  ${index + 1}. ${severity} ${violation.metric.toUpperCase()}`);
      lines.push(`     Threshold: ${violation.threshold}`);
      lines.push(`     Actual:    ${violation.actual.toFixed(2)}`);
      lines.push(`     Violated:  ${violation.violatedAt.toISOString()}`);
    });
    lines.push('');
  }

  lines.push('📝 SUMMARY');
  lines.push(`  ${report.summary}`);
  lines.push('');

  if (report.recommendations.length > 0) {
    lines.push('💡 RECOMMENDATIONS');
    report.recommendations.forEach((rec, index) => {
      lines.push(`  ${index + 1}. ${rec}`);
    });
    lines.push('');
  }

  lines.push('╔═══════════════════════════════════════════════════════════════╗');
  lines.push('║ END OF REPORT                                                 ║');
  lines.push('╚═══════════════════════════════════════════════════════════════╝');

  return lines.join('\n');
}

/**
 * Generate JSON report
 */
export function generateJsonReport(report: SLAReport): Record<string, any> {
  return {
    reportId: report.reportId,
    providerId: report.providerId,
    generatedAt: report.generatedAt.toISOString(),
    period: {
      startTime: report.period.startTime.toISOString(),
      endTime: report.period.endTime.toISOString(),
    },
    metrics: {
      uptime: (report.metrics.uptime || 0).toFixed(2),
      availability: ((report.metrics.availability || 0) * 100).toFixed(2),
      avgLatencyMs: (report.metrics.avgLatencyMs || 0).toFixed(2),
      p99LatencyMs: (report.metrics.p99LatencyMs || 0).toFixed(2),
      p95LatencyMs: (report.metrics.p95LatencyMs || 0).toFixed(2),
      minLatencyMs: (report.metrics.minLatencyMs || 0).toFixed(2),
      maxLatencyMs: (report.metrics.maxLatencyMs || 0).toFixed(2),
      totalRequests: report.metrics.totalRequests,
      successfulRequests: report.metrics.successfulRequests,
      failedRequests: report.metrics.failedRequests,
      reliability: ((report.metrics.reliability || 0) * 100).toFixed(2),
    },
    status: report.status,
    violations: report.violations.map((v) => ({
      metric: v.metric,
      threshold: v.threshold,
      actual: v.actual.toFixed(2),
      violatedAt: v.violatedAt.toISOString(),
      severity: v.severity,
    })),
    summary: report.summary,
    recommendations: report.recommendations,
  };
}

/**
 * Generate CSV report data
 */
export function generateCsvReport(report: SLAReport): string {
  const lines: string[] = [];

  // Header
  lines.push('Metric,Value,Threshold,Status');
  lines.push('');

  // Metrics
  const metrics = report.metrics;
  const thresholdUptime = 99.9;
  const thresholdLatency = 1000;
  const thresholdReliability = 0.95;

  const uptimeStatus =
    (metrics.uptime || 0) >= thresholdUptime ? 'PASS' : 'FAIL';
  lines.push(
    `Uptime,${(metrics.uptime || 0).toFixed(2)}%,${thresholdUptime}%,${uptimeStatus}`,
  );

  const latencyStatus =
    (metrics.p99LatencyMs || 0) <= thresholdLatency ? 'PASS' : 'FAIL';
  lines.push(
    `P99 Latency,${(metrics.p99LatencyMs || 0).toFixed(0)}ms,${thresholdLatency}ms,${latencyStatus}`,
  );

  const reliabilityStatus =
    (metrics.reliability || 0) >= thresholdReliability ? 'PASS' : 'FAIL';
  lines.push(
    `Reliability,${(metrics.reliability || 0).toFixed(3)},${thresholdReliability},${reliabilityStatus}`,
  );

  lines.push(
    `Total Requests,${metrics.totalRequests || 0},,`,
  );
  lines.push(
    `Successful Requests,${metrics.successfulRequests || 0},,`,
  );
  lines.push(
    `Failed Requests,${metrics.failedRequests || 0},,`,
  );
  lines.push('');

  // Violations
  if (report.violations.length > 0) {
    lines.push('Violations');
    lines.push('Metric,Threshold,Actual,Severity,Violated At');
    report.violations.forEach((v) => {
      lines.push(
        `${v.metric},${v.threshold},${v.actual.toFixed(2)},${v.severity},${v.violatedAt.toISOString()}`,
      );
    });
  }

  return lines.join('\n');
}

/**
 * Generate HTML report
 */
export function generateHtmlReport(report: SLAReport): string {
  const statusColor =
    report.status === 'compliant'
      ? '#28a745'
      : report.status === 'at-risk'
        ? '#ffc107'
        : '#dc3545';
  const statusText =
    report.status === 'compliant'
      ? 'COMPLIANT'
      : report.status === 'at-risk'
        ? 'AT-RISK'
        : 'BREACHED';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stellar Bridge SLA Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 20px; background-color: #f5f5f5; }
        .container { max-width: 1000px; margin: 0 auto; background-color: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { border-bottom: 2px solid #007bff; padding-bottom: 20px; margin-bottom: 30px; }
        .header h1 { margin: 0 0 10px 0; color: #007bff; }
        .report-meta { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .meta-item { padding: 10px; background-color: #f9f9f9; border-left: 3px solid #007bff; }
        .meta-item strong { color: #007bff; }
        .status-badge { display: inline-block; padding: 8px 16px; border-radius: 4px; color: white; font-weight: bold; background-color: ${statusColor}; }
        .metrics-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .metric-card { padding: 20px; background-color: #f9f9f9; border-radius: 4px; text-align: center; }
        .metric-value { font-size: 24px; font-weight: bold; color: #007bff; margin-bottom: 5px; }
        .metric-label { color: #666; font-size: 14px; }
        .violations { background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin-bottom: 30px; border-radius: 4px; }
        .violation-item { padding: 10px 0; border-bottom: 1px solid #ffe69c; }
        .violation-item:last-child { border-bottom: none; }
        .critical { color: #dc3545; font-weight: bold; }
        .warning { color: #ffc107; font-weight: bold; }
        .summary { background-color: #e7f3ff; padding: 20px; border-radius: 4px; margin-bottom: 30px; border-left: 4px solid #007bff; }
        .recommendations { background-color: #f0f8f0; padding: 20px; border-radius: 4px; border-left: 4px solid #28a745; }
        .recommendations h3 { margin-top: 0; color: #28a745; }
        .recommendations li { margin-bottom: 10px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #ddd; }
        th { background-color: #007bff; color: white; }
        tr:hover { background-color: #f9f9f9; }
        .footer { text-align: center; color: #999; font-size: 12px; margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Stellar Bridge SLA Report</h1>
            <p>Provider: <strong>${report.providerId}</strong> | Status: <span class="status-badge">${statusText}</span></p>
        </div>

        <div class="report-meta">
            <div class="meta-item">
                <strong>Report ID:</strong> ${report.reportId}
            </div>
            <div class="meta-item">
                <strong>Generated:</strong> ${report.generatedAt.toLocaleString()}
            </div>
            <div class="meta-item">
                <strong>Period Start:</strong> ${report.period.startTime.toLocaleString()}
            </div>
            <div class="meta-item">
                <strong>Period End:</strong> ${report.period.endTime.toLocaleString()}
            </div>
        </div>

        <h2>Performance Metrics</h2>
        <div class="metrics-grid">
            <div class="metric-card">
                <div class="metric-value">${(report.metrics.uptime || 0).toFixed(2)}%</div>
                <div class="metric-label">Uptime</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${(report.metrics.avgLatencyMs || 0).toFixed(0)}ms</div>
                <div class="metric-label">Avg Latency</div>
            </div>
            <div class="metric-card">
                <div class="metric-value">${((report.metrics.reliability || 0) * 100).toFixed(2)}%</div>
                <div class="metric-label">Reliability</div>
            </div>
        </div>

        <table>
            <tr>
                <th>Metric</th>
                <th>Value</th>
            </tr>
            <tr>
                <td>Availability</td>
                <td>${((report.metrics.availability || 0) * 100).toFixed(2)}%</td>
            </tr>
            <tr>
                <td>P99 Latency</td>
                <td>${(report.metrics.p99LatencyMs || 0).toFixed(2)}ms</td>
            </tr>
            <tr>
                <td>P95 Latency</td>
                <td>${(report.metrics.p95LatencyMs || 0).toFixed(2)}ms</td>
            </tr>
            <tr>
                <td>Min Latency</td>
                <td>${(report.metrics.minLatencyMs || 0).toFixed(2)}ms</td>
            </tr>
            <tr>
                <td>Max Latency</td>
                <td>${(report.metrics.maxLatencyMs || 0).toFixed(2)}ms</td>
            </tr>
            <tr>
                <td>Total Requests</td>
                <td>${report.metrics.totalRequests}</td>
            </tr>
            <tr>
                <td>Successful Requests</td>
                <td>${report.metrics.successfulRequests}</td>
            </tr>
            <tr>
                <td>Failed Requests</td>
                <td>${report.metrics.failedRequests}</td>
            </tr>
        </table>

        ${
          report.violations.length > 0
            ? `
        <div class="violations">
            <h3>⚠️ Violations Found</h3>
            ${report.violations
              .map(
                (v) => `
            <div class="violation-item">
                <span class="${v.severity}">[${v.severity.toUpperCase()}]</span> 
                <strong>${v.metric}</strong>: Threshold ${v.threshold}, Actual ${v.actual.toFixed(2)}
            </div>
            `,
              )
              .join('')}
        </div>
        `
            : ''
        }

        <div class="summary">
            <h3>Summary</h3>
            <p>${report.summary}</p>
        </div>

        ${
          report.recommendations.length > 0
            ? `
        <div class="recommendations">
            <h3>💡 Recommendations</h3>
            <ul>
                ${report.recommendations.map((rec) => `<li>${rec}</li>`).join('')}
            </ul>
        </div>
        `
            : ''
        }

        <div class="footer">
            <p>© Stellar Bridge Monitoring System | Report generated ${new Date().toISOString()}</p>
        </div>
    </div>
</body>
</html>
  `.trim();
}

/**
 * Export report in multiple formats
 */
export function exportReport(
  report: SLAReport,
  format: 'text' | 'json' | 'csv' | 'html' = 'text',
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(generateJsonReport(report), null, 2);
    case 'csv':
      return generateCsvReport(report);
    case 'html':
      return generateHtmlReport(report);
    case 'text':
    default:
      return generateTextReport(report);
  }
}
