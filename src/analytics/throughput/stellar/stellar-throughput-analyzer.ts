export interface StellarThroughputSample {
  providerId: string;
  routeId?: string;
  amount?: string;
  durationMs: number;
  processedAt: Date;
  success: boolean;
}

export interface StellarThroughputAnalyzerOptions {
  keepMaxSamples?: number;
}

export interface StellarProviderThroughputMetrics {
  providerId: string;
  throughputOpsPerSecond: number;
  averageDurationMs: number;
  successRate: number;
  totalTransfers: number;
  totalAmountProcessed: number;
}

export interface StellarProviderComparison extends StellarProviderThroughputMetrics {
  rank: number;
}

export class StellarThroughputAnalyzer {
  private readonly samples: StellarThroughputSample[] = [];
  private readonly maxSamples: number;

  constructor(options: StellarThroughputAnalyzerOptions = {}) {
    this.maxSamples = options.keepMaxSamples ?? 10_000;
  }

  recordTransfer(sample: Omit<StellarThroughputSample, 'processedAt'>): StellarThroughputSample {
    if (!sample.providerId?.trim()) {
      throw new Error('providerId must be a non-empty string');
    }
    if (sample.durationMs < 0) {
      throw new Error('durationMs must be a non-negative number');
    }

    const entry: StellarThroughputSample = {
      ...sample,
      providerId: sample.providerId.trim(),
      routeId: sample.routeId?.trim(),
      processedAt: new Date(),
    };

    this.samples.push(entry);
    if (this.samples.length > this.maxSamples) {
      this.samples.splice(0, this.samples.length - this.maxSamples);
    }
    return entry;
  }

  getProviderMetrics(
    providerId: string,
    windowMs: number = 60_000
  ): StellarProviderThroughputMetrics {
    const now = Date.now();
    const samples = this.samples.filter(
      (sample) =>
        sample.providerId === providerId &&
        now - sample.processedAt.getTime() <= windowMs
    );

    const totalTransfers = samples.length;
    const totalSuccess = samples.filter((sample) => sample.success).length;
    const averageDurationMs =
      totalTransfers === 0
        ? 0
        : samples.reduce((sum, sample) => sum + sample.durationMs, 0) / totalTransfers;
    const throughputOpsPerSecond = windowMs === 0 ? 0 : totalTransfers / (windowMs / 1000);

    return {
      providerId,
      throughputOpsPerSecond,
      averageDurationMs,
      successRate: totalTransfers === 0 ? 0 : totalSuccess / totalTransfers,
      totalTransfers,
      totalAmountProcessed: samples.reduce(
        (sum, sample) => sum + (parseFloat(sample.amount ?? '0') || 0),
        0,
      ),
    };
  }

  compareProviders(providerIds: string[], windowMs: number = 60_000): StellarProviderComparison[] {
    const metrics = providerIds
      .map((providerId) => this.getProviderMetrics(providerId, windowMs))
      .sort((a, b) => b.throughputOpsPerSecond - a.throughputOpsPerSecond);

    return metrics.map((metric, index) => ({ ...metric, rank: index + 1 }));
  }

  getSamples(): StellarThroughputSample[] {
    return [...this.samples];
  }
}
