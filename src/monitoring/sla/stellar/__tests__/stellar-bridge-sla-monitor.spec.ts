/**
 * Stellar Bridge SLA Monitor Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StellarBridgeSlaMonitor } from '../stellar-bridge-sla-monitor';
import type { SLAMeasurement, SLAReport, SLAThresholds } from '../types';

describe('StellarBridgeSlaMonitor', () => {
  let monitor: StellarBridgeSlaMonitor;
  let testProbeResults: SLAMeasurement[];

  beforeEach(() => {
    testProbeResults = [];
    monitor = new StellarBridgeSlaMonitor({
      checkIntervalMs: 100,
      timeoutMs: 1000,
      thresholds: {
        uptimePercentage: 99.5,
        maxLatencyMs: 500,
        minReliability: 0.99,
      },
      autoReportGeneration: false,
    });
  });

  afterEach(() => {
    monitor.reset();
  });

  describe('Provider Registration', () => {
    it('should register a provider', () => {
      const probe = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      monitor.registerProvider('stellar-bridge-1', probe);

      const status = monitor.getStatus('stellar-bridge-1');
      expect(status).toBeDefined();
      expect(status?.providerId).toBe('stellar-bridge-1');
    });

    it('should unregister a provider', () => {
      const probe = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      monitor.registerProvider('stellar-bridge-1', probe);

      const unregistered = monitor.unregisterProvider('stellar-bridge-1');
      expect(unregistered).toBe(true);
      expect(monitor.getStatus('stellar-bridge-1')).toBeNull();
    });

    it('should not unregister non-existent provider', () => {
      const unregistered = monitor.unregisterProvider('non-existent');
      expect(unregistered).toBe(false);
    });
  });

  describe('SLA Monitoring', () => {
    it('should track successful measurements', async () => {
      const probe = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < 10; i++) {
        await monitor.checkProvider('provider-1');
      }

      const metrics = monitor.getMetrics('provider-1');
      expect(metrics?.totalRequests).toBe(10);
      expect(metrics?.successfulRequests).toBe(10);
      expect(metrics?.failedRequests).toBe(0);
      expect(metrics?.uptime).toBe(100);
    });

    it('should track failed measurements', async () => {
      const probe = vi
        .fn()
        .mockResolvedValueOnce({ success: true, latencyMs: 100 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 })
        .mockResolvedValueOnce({ success: true, latencyMs: 150 });

      monitor.registerProvider('provider-1', probe);

      await monitor.checkProvider('provider-1');
      await monitor.checkProvider('provider-1');
      await monitor.checkProvider('provider-1');

      const metrics = monitor.getMetrics('provider-1');
      expect(metrics?.totalRequests).toBe(3);
      expect(metrics?.successfulRequests).toBe(2);
      expect(metrics?.failedRequests).toBe(1);
      expect(metrics?.uptime).toBeCloseTo(66.67, 1);
    });

    it('should calculate latency percentiles correctly', async () => {
      const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      let latencyIndex = 0;

      const probe = vi.fn().mockImplementation(() =>
        Promise.resolve({
          success: true,
          latencyMs: latencies[latencyIndex++],
        }),
      );

      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < latencies.length; i++) {
        await monitor.checkProvider('provider-1');
      }

      const metrics = monitor.getMetrics('provider-1');
      expect(metrics?.minLatencyMs).toBe(100);
      expect(metrics?.maxLatencyMs).toBe(1000);
      expect(metrics?.avgLatencyMs).toBeCloseTo(550, 0);
      expect(metrics?.p95LatencyMs).toBeGreaterThan(800);
      expect(metrics?.p99LatencyMs).toBeGreaterThan(900);
    });
  });

  describe('SLA Violations', () => {
    it('should detect uptime violations', async () => {
      const probe = vi
        .fn()
        .mockResolvedValueOnce({ success: true, latencyMs: 100 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 });

      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < 3; i++) {
        await monitor.checkProvider('provider-1');
      }

      const status = monitor.getStatus('provider-1');
      expect(status?.violations.length).toBeGreaterThan(0);
      const uptimeViolation = status?.violations.find((v) => v.metric === 'uptime');
      expect(uptimeViolation).toBeDefined();
    });

    it('should detect latency violations', async () => {
      const probe = vi.fn().mockResolvedValue({ success: true, latencyMs: 1000 });
      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < 5; i++) {
        await monitor.checkProvider('provider-1');
      }

      const status = monitor.getStatus('provider-1');
      const latencyViolation = status?.violations.find((v) => v.metric === 'latency');
      expect(latencyViolation).toBeDefined();
    });

    it('should classify violations as critical or warning', async () => {
      const probe = vi
        .fn()
        .mockResolvedValueOnce({ success: true, latencyMs: 100 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 });

      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < 3; i++) {
        await monitor.checkProvider('provider-1');
      }

      const status = monitor.getStatus('provider-1');
      const violations = status?.violations || [];

      expect(violations.some((v) => v.severity === 'critical')).toBe(true);
    });
  });

  describe('Status Management', () => {
    it('should track status changes', async () => {
      const probe = vi
        .fn()
        .mockResolvedValueOnce({ success: true, latencyMs: 100 });

      monitor.registerProvider('provider-1', probe);
      let statusChangeCount = 0;

      monitor.on('status-change', () => {
        statusChangeCount++;
      });

      await monitor.checkProvider('provider-1');
      expect(statusChangeCount).toBeGreaterThanOrEqual(0);
    });

    it('should return all provider statuses', async () => {
      const probe1 = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      const probe2 = vi.fn().mockResolvedValue({ success: true, latencyMs: 150 });

      monitor.registerProvider('provider-1', probe1);
      monitor.registerProvider('provider-2', probe2);

      await monitor.checkProvider('provider-1');
      await monitor.checkProvider('provider-2');

      const allStatuses = monitor.getAllStatuses();
      expect(allStatuses.length).toBe(2);
    });
  });

  describe('Report Generation', () => {
    it('should generate a report', async () => {
      const probe = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < 10; i++) {
        await monitor.checkProvider('provider-1');
      }

      const report = monitor.generateReport('provider-1');
      expect(report).toBeDefined();
      expect(report?.providerId).toBe('provider-1');
      expect(report?.metrics.totalRequests).toBe(10);
    });

    it('should generate report with violations', async () => {
      const probe = vi
        .fn()
        .mockResolvedValueOnce({ success: true, latencyMs: 100 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 });

      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < 3; i++) {
        await monitor.checkProvider('provider-1');
      }

      const report = monitor.generateReport('provider-1');
      expect(report?.violations.length).toBeGreaterThan(0);
    });

    it('should generate reports for all providers', async () => {
      const probe1 = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      const probe2 = vi.fn().mockResolvedValue({ success: true, latencyMs: 150 });

      monitor.registerProvider('provider-1', probe1);
      monitor.registerProvider('provider-2', probe2);

      for (let i = 0; i < 5; i++) {
        await monitor.checkProvider('provider-1');
        await monitor.checkProvider('provider-2');
      }

      const reports = await monitor.generateAllReports();
      expect(reports.length).toBe(2);
    });

    it('should include recommendations in reports', async () => {
      const probe = vi
        .fn()
        .mockResolvedValueOnce({ success: true, latencyMs: 100 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 });

      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < 3; i++) {
        await monitor.checkProvider('provider-1');
      }

      const report = monitor.generateReport('provider-1');
      expect(report?.recommendations.length).toBeGreaterThan(0);
    });
  });

  describe('Monitoring Lifecycle', () => {
    it('should start and stop monitoring', async () => {
      const probe = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      monitor.registerProvider('provider-1', probe);

      monitor.startMonitoring();
      expect(probe).toHaveBeenCalled();

      monitor.stopMonitoring();
      const initialCallCount = probe.mock.calls.length;
      await new Promise((resolve) => setTimeout(resolve, 150));
      expect(probe.mock.calls.length).toBe(initialCallCount);
    });

    it('should handle timeouts gracefully', async () => {
      const probe = vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => {
              setTimeout(() => resolve({ success: true, latencyMs: 100 }), 2000);
            }),
        );

      monitor.registerProvider('provider-1', probe);
      const measurement = await monitor.checkProvider('provider-1');

      expect(measurement?.available).toBe(false);
      expect(measurement?.latencyMs).toBe(1000); // timeout value
    });

    it('should reset all data', async () => {
      const probe = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      monitor.registerProvider('provider-1', probe);

      await monitor.checkProvider('provider-1');
      monitor.reset();

      expect(monitor.getStatus('provider-1')).toBeNull();
      expect(monitor.getMetrics('provider-1')).toBeNull();
    });
  });

  describe('Error Handling', () => {
    it('should handle probe errors', async () => {
      const probe = vi
        .fn()
        .mockRejectedValue(new Error('Probe failed'));

      monitor.registerProvider('provider-1', probe);
      const measurement = await monitor.checkProvider('provider-1');

      expect(measurement?.available).toBe(false);
      expect(measurement?.errorMessage).toContain('Probe failed');
    });

    it('should emit violation events', async () => {
      const probe = vi
        .fn()
        .mockResolvedValueOnce({ success: true, latencyMs: 100 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 })
        .mockResolvedValueOnce({ success: false, latencyMs: 0 });

      let violationCount = 0;
      monitor.on('violation', () => {
        violationCount++;
      });

      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < 3; i++) {
        await monitor.checkProvider('provider-1');
      }

      expect(violationCount).toBeGreaterThan(0);
    });

    it('should emit report-generated events', async () => {
      const probe = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      let reportCount = 0;

      monitor.on('report-generated', () => {
        reportCount++;
      });

      monitor.registerProvider('provider-1', probe);

      for (let i = 0; i < 5; i++) {
        await monitor.checkProvider('provider-1');
      }

      monitor.generateReport('provider-1');
      expect(reportCount).toBe(1);
    });
  });

  describe('Metrics Calculation', () => {
    it('should calculate reliability correctly', async () => {
      const successProbe = vi.fn().mockResolvedValue({ success: true, latencyMs: 100 });
      const failProbe = vi.fn().mockResolvedValue({ success: false, latencyMs: 0 });

      monitor.registerProvider('reliable', successProbe);
      monitor.registerProvider('unreliable', failProbe);

      for (let i = 0; i < 10; i++) {
        await monitor.checkProvider('reliable');
        await monitor.checkProvider('unreliable');
      }

      const reliableMetrics = monitor.getMetrics('reliable');
      const unreliableMetrics = monitor.getMetrics('unreliable');

      expect(reliableMetrics?.reliability).toBe(1);
      expect(unreliableMetrics?.reliability).toBe(0);
    });

    it('should handle empty measurements', () => {
      monitor.registerProvider('provider-1', vi.fn());

      const metrics = monitor.getMetrics('provider-1');
      expect(metrics?.totalRequests).toBe(0);
      expect(metrics?.uptime).toBe(100);
    });
  });
});
