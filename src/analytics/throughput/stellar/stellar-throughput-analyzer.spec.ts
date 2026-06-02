import { StellarThroughputAnalyzer } from './stellar-throughput-analyzer';

describe('StellarThroughputAnalyzer', () => {
  let analyzer: StellarThroughputAnalyzer;

  beforeEach(() => {
    analyzer = new StellarThroughputAnalyzer({ keepMaxSamples: 100 });
  });

  it('should record transfer samples', () => {
    const sample = analyzer.recordTransfer({
      providerId: 'stellar-provider-1',
      durationMs: 150,
      success: true,
      amount: '10.5',
    });

    expect(sample.providerId).toBe('stellar-provider-1');
    expect(sample.processedAt).toBeInstanceOf(Date);
    expect(analyzer.getSamples()).toHaveLength(1);
  });

  it('should calculate throughput and success rate', () => {
    analyzer.recordTransfer({ providerId: 'stellar-provider-1', durationMs: 150, success: true });
    analyzer.recordTransfer({ providerId: 'stellar-provider-1', durationMs: 200, success: false });

    const metrics = analyzer.getProviderMetrics('stellar-provider-1', 10_000);

    expect(metrics.totalTransfers).toBe(2);
    expect(metrics.successRate).toBe(0.5);
    expect(metrics.throughputOpsPerSecond).toBeGreaterThan(0);
    expect(metrics.averageDurationMs).toBeGreaterThanOrEqual(150);
  });

  it('should ignore samples outside the defined window', () => {
    const oldSample = analyzer.recordTransfer({
      providerId: 'stellar-provider-1',
      durationMs: 100,
      success: true,
    });

    oldSample.processedAt = new Date(Date.now() - 120_000);

    const metrics = analyzer.getProviderMetrics('stellar-provider-1', 30_000);

    expect(metrics.totalTransfers).toBe(0);
    expect(metrics.successRate).toBe(0);
  });

  it('should compare providers by throughput', () => {
    analyzer.recordTransfer({ providerId: 'provider-a', durationMs: 80, success: true });
    analyzer.recordTransfer({ providerId: 'provider-b', durationMs: 120, success: true });
    analyzer.recordTransfer({ providerId: 'provider-b', durationMs: 130, success: true });

    const comparisons = analyzer.compareProviders(['provider-a', 'provider-b'], 60_000);

    expect(comparisons[0].providerId).toBe('provider-b');
    expect(comparisons[0].rank).toBe(1);
    expect(comparisons[1].rank).toBe(2);
  });
});
