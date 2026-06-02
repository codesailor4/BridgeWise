/**
 * SLA Metrics Utilities Tests
 */

import { describe, it, expect } from 'vitest';
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
  estimateRecoveryTime,
} from '../metrics-utils';
import type { SLAMeasurement, SLAMetrics } from '../types';

describe('SLA Metrics Utils', () => {
  describe('calculatePercentile', () => {
    it('should calculate percentiles correctly', () => {
      const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      expect(calculatePercentile(values, 50)).toBe(5.5);
      expect(calculatePercentile(values, 95)).toBeGreaterThan(9);
      expect(calculatePercentile(values, 99)).toBeGreaterThan(9.8);
    });

    it('should handle single value', () => {
      expect(calculatePercentile([100], 50)).toBe(100);
    });

    it('should handle empty array', () => {
      expect(calculatePercentile([], 50)).toBe(0);
    });
  });

  describe('calculateMovingAverage', () => {
    it('should calculate moving average', () => {
      const measurements: SLAMeasurement[] = [
        { timestamp: new Date(), available: true, latencyMs: 100 },
        { timestamp: new Date(), available: true, latencyMs: 200 },
        { timestamp: new Date(), available: true, latencyMs: 300 },
      ];

      const avg = calculateMovingAverage(measurements, 3);
      expect(avg).toBe(200);
    });

    it('should ignore failed measurements', () => {
      const measurements: SLAMeasurement[] = [
        { timestamp: new Date(), available: true, latencyMs: 100 },
        { timestamp: new Date(), available: false, latencyMs: 0 },
        { timestamp: new Date(), available: true, latencyMs: 300 },
      ];

      const avg = calculateMovingAverage(measurements, 3);
      expect(avg).toBe(200);
    });

    it('should handle empty measurements', () => {
      expect(calculateMovingAverage([], 10)).toBe(0);
    });
  });

  describe('calculateStandardDeviation', () => {
    it('should calculate standard deviation', () => {
      const measurements: SLAMeasurement[] = [
        { timestamp: new Date(), available: true, latencyMs: 100 },
        { timestamp: new Date(), available: true, latencyMs: 200 },
        { timestamp: new Date(), available: true, latencyMs: 300 },
        { timestamp: new Date(), available: true, latencyMs: 400 },
        { timestamp: new Date(), available: true, latencyMs: 500 },
      ];

      const stdDev = calculateStandardDeviation(measurements);
      expect(stdDev).toBeGreaterThan(0);
      expect(stdDev).toBeLessThan(200);
    });

    it('should return 0 for single measurement', () => {
      const measurements: SLAMeasurement[] = [
        { timestamp: new Date(), available: true, latencyMs: 100 },
      ];

      expect(calculateStandardDeviation(measurements)).toBe(0);
    });
  });

  describe('detectAnomalies', () => {
    it('should detect latency anomalies', () => {
      const measurements: SLAMeasurement[] = [
        { timestamp: new Date(), available: true, latencyMs: 100 },
        { timestamp: new Date(), available: true, latencyMs: 110 },
        { timestamp: new Date(), available: true, latencyMs: 105 },
        { timestamp: new Date(), available: true, latencyMs: 5000 }, // Anomaly
      ];

      const anomalies = detectAnomalies(measurements, 2);
      expect(anomalies.length).toBeGreaterThan(0);
      expect(anomalies[0].latencyMs).toBe(5000);
    });

    it('should handle empty measurements', () => {
      expect(detectAnomalies([], 2)).toEqual([]);
    });
  });

  describe('calculateComplianceScore', () => {
    it('should calculate full compliance score', () => {
      const metrics: Partial<SLAMetrics> = {
        uptime: 100,
        p99LatencyMs: 500,
        reliability: 1,
      };

      const score = calculateComplianceScore(metrics, {
        uptimePercentage: 99.9,
        maxLatencyMs: 1000,
        minReliability: 0.95,
      });

      expect(score).toBe(100);
    });

    it('should deduct for violations', () => {
      const metrics: Partial<SLAMetrics> = {
        uptime: 95,
        p99LatencyMs: 2000,
        reliability: 0.8,
      };

      const score = calculateComplianceScore(metrics, {
        uptimePercentage: 99.9,
        maxLatencyMs: 1000,
        minReliability: 0.95,
      });

      expect(score).toBeLessThan(100);
      expect(score).toBeGreaterThanOrEqual(0);
    });
  });

  describe('calculateMetricsTrend', () => {
    it('should calculate positive trends', () => {
      const current: Partial<SLAMetrics> = {
        uptime: 99.5,
        avgLatencyMs: 100,
        reliability: 0.98,
      };

      const previous: Partial<SLAMetrics> = {
        uptime: 99.0,
        avgLatencyMs: 150,
        reliability: 0.95,
      };

      const trend = calculateMetricsTrend(current, previous);
      expect(trend.uptimeTrend).toBeGreaterThan(0);
      expect(trend.latencyTrend).toBeLessThan(0); // Lower latency is better
      expect(trend.reliabilityTrend).toBeGreaterThan(0);
    });
  });

  describe('formatMetricsForDisplay', () => {
    it('should format metrics correctly', () => {
      const metrics: Partial<SLAMetrics> = {
        uptime: 99.5,
        availability: 0.995,
        avgLatencyMs: 123.456,
        reliability: 0.99,
      };

      const formatted = formatMetricsForDisplay(metrics);
      expect(formatted.uptime).toContain('99.50');
      expect(formatted.uptime).toContain('%');
      expect(formatted.avgLatency).toContain('ms');
    });
  });

  describe('aggregateMetrics', () => {
    it('should aggregate multiple metrics', () => {
      const metricsList: Array<Partial<SLAMetrics>> = [
        {
          totalRequests: 100,
          successfulRequests: 99,
          failedRequests: 1,
          uptime: 99,
          availability: 0.99,
          avgLatencyMs: 100,
        },
        {
          totalRequests: 100,
          successfulRequests: 98,
          failedRequests: 2,
          uptime: 98,
          availability: 0.98,
          avgLatencyMs: 150,
        },
      ];

      const aggregated = aggregateMetrics(metricsList);
      expect(aggregated.totalRequests).toBe(200);
      expect(aggregated.successfulRequests).toBe(197);
      expect(aggregated.uptime).toBeLessThan(100);
    });

    it('should handle empty metrics list', () => {
      const aggregated = aggregateMetrics([]);
      expect(aggregated.uptime).toBe(0);
      expect(aggregated.totalRequests).toBe(0);
    });
  });

  describe('checkSlaCompliance', () => {
    it('should return true for compliant metrics', () => {
      const metrics: Partial<SLAMetrics> = {
        uptime: 99.95,
        p99LatencyMs: 500,
        reliability: 0.99,
      };

      const compliant = checkSlaCompliance(metrics, {
        uptimePercentage: 99.9,
        maxLatencyMs: 1000,
        minReliability: 0.95,
      });

      expect(compliant).toBe(true);
    });

    it('should return false for non-compliant metrics', () => {
      const metrics: Partial<SLAMetrics> = {
        uptime: 95,
        p99LatencyMs: 2000,
        reliability: 0.8,
      };

      const compliant = checkSlaCompliance(metrics, {
        uptimePercentage: 99.9,
        maxLatencyMs: 1000,
        minReliability: 0.95,
      });

      expect(compliant).toBe(false);
    });
  });

  describe('estimateRecoveryTime', () => {
    it('should estimate recovery time for improving trends', () => {
      // If violations are decreasing, estimate recovery time
      const recoveryTime = estimateRecoveryTime(10, -2, 5); // 10 violations, -2 trend, 5 threshold
      expect(recoveryTime).toBeGreaterThan(0);
    });

    it('should return null for stable or worsening trends', () => {
      expect(estimateRecoveryTime(10, 0, 5)).toBeNull();
      expect(estimateRecoveryTime(10, 2, 5)).toBeNull();
    });

    it('should return 0 if already at threshold', () => {
      const recoveryTime = estimateRecoveryTime(3, -2, 5); // Already below threshold
      expect(recoveryTime).toBe(0);
    });
  });
});
