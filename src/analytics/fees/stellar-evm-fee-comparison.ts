import * as crypto from 'crypto';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BridgeType = 'stellar' | 'evm';

export interface BridgeFeeRecord {
  id: string;
  timestamp: Date;
  bridgeId: string;
  bridgeType: BridgeType;
  sourceChain: string;
  destinationChain: string;
  /** Fee denominated in USD. */
  feeUsd: number;
  /** Fee in the native token of the source chain (human-readable string). */
  feeNative?: string;
}

export interface FeeComparisonEntry {
  bridgeId: string;
  bridgeType: BridgeType;
  averageFeeUsd: number;
  sampleCount: number;
  /** 1 = cheapest. Higher rank means more expensive. */
  rank: number;
  /**
   * How this bridge's average fee relates to the overall average across all
   * bridges (positive = more expensive, negative = cheaper).
   */
  relativeToAveragePct: number;
}

export interface FeeComparisonResult {
  sourceChain: string;
  destinationChain: string;
  rankedBridges: FeeComparisonEntry[];
  cheapest: FeeComparisonEntry | null;
  mostExpensive: FeeComparisonEntry | null;
  averageFeeUsd: number;
  feeRangeUsd: { min: number; max: number };
  sampleCount: number;
  generatedAt: Date;
}

export interface StellarEvmFeeComparisonEngineOptions {
  /**
   * Rolling window in days used for fee aggregation. Default: 7.
   */
  windowDays?: number;
  /**
   * Maximum records kept per bridge. Oldest are pruned first. Default: unlimited.
   */
  maxRecordsPerBridge?: number;
}

// ─── Engine ───────────────────────────────────────────────────────────────────

export class StellarEvmFeeComparisonEngine {
  private records: BridgeFeeRecord[] = [];
  private readonly windowDays: number;
  private readonly maxRecordsPerBridge: number;

  constructor(options: StellarEvmFeeComparisonEngineOptions = {}) {
    this.windowDays = options.windowDays ?? 7;
    this.maxRecordsPerBridge = options.maxRecordsPerBridge ?? Infinity;
  }

  // ─── Write ─────────────────────────────────────────────────────────────────

  /**
   * Record a new fee data point for a bridge.
   */
  recordFee(
    data: Omit<BridgeFeeRecord, 'id' | 'timestamp'> & { timestamp?: Date },
  ): BridgeFeeRecord {
    if (!data.bridgeId?.trim()) {
      throw new Error('bridgeId must be a non-empty string');
    }
    if (!data.sourceChain?.trim()) {
      throw new Error('sourceChain must be a non-empty string');
    }
    if (!data.destinationChain?.trim()) {
      throw new Error('destinationChain must be a non-empty string');
    }
    if (data.feeUsd < 0) {
      throw new Error(`feeUsd must be non-negative, got ${data.feeUsd}`);
    }

    const record: BridgeFeeRecord = {
      id: crypto.randomUUID(),
      timestamp: data.timestamp ?? new Date(),
      bridgeId: data.bridgeId.trim(),
      bridgeType: data.bridgeType,
      sourceChain: data.sourceChain.trim().toLowerCase(),
      destinationChain: data.destinationChain.trim().toLowerCase(),
      feeUsd: data.feeUsd,
      feeNative: data.feeNative,
    };

    this.records.push(record);
    this.pruneBridge(record.bridgeId);
    return record;
  }

  // ─── Query ─────────────────────────────────────────────────────────────────

  /**
   * Compare all registered bridges for a given source → destination pair,
   * ranked from cheapest to most expensive by average fee over the window.
   */
  compareFees(
    sourceChain: string,
    destinationChain: string,
    windowDays?: number,
  ): FeeComparisonResult {
    const days = windowDays ?? this.windowDays;
    const src = sourceChain.trim().toLowerCase();
    const dst = destinationChain.trim().toLowerCase();

    const window = this.getWindowRecords(src, dst, days);

    if (window.length === 0) {
      return {
        sourceChain: src,
        destinationChain: dst,
        rankedBridges: [],
        cheapest: null,
        mostExpensive: null,
        averageFeeUsd: 0,
        feeRangeUsd: { min: 0, max: 0 },
        sampleCount: 0,
        generatedAt: new Date(),
      };
    }

    // Aggregate per bridge
    const byBridge = groupBy(window, (r) => r.bridgeId);
    const aggregated = Object.entries(byBridge).map(([bridgeId, recs]) => ({
      bridgeId,
      bridgeType: recs[0].bridgeType,
      averageFeeUsd: round(mean(recs.map((r) => r.feeUsd))),
      sampleCount: recs.length,
    }));

    // Sort cheapest first
    aggregated.sort((a, b) => a.averageFeeUsd - b.averageFeeUsd);

    const overallAvg = mean(aggregated.map((e) => e.averageFeeUsd));
    const allFees = window.map((r) => r.feeUsd);

    const rankedBridges: FeeComparisonEntry[] = aggregated.map((entry, i) => ({
      ...entry,
      rank: i + 1,
      relativeToAveragePct:
        overallAvg > 0
          ? round(((entry.averageFeeUsd - overallAvg) / overallAvg) * 100, 2)
          : 0,
    }));

    return {
      sourceChain: src,
      destinationChain: dst,
      rankedBridges,
      cheapest: rankedBridges[0] ?? null,
      mostExpensive: rankedBridges[rankedBridges.length - 1] ?? null,
      averageFeeUsd: round(overallAvg),
      feeRangeUsd: {
        min: round(Math.min(...allFees)),
        max: round(Math.max(...allFees)),
      },
      sampleCount: window.length,
      generatedAt: new Date(),
    };
  }

  /**
   * Returns the cheapest bridge entry for a given route.
   * Returns null if no data is available.
   */
  getCheapestRoute(
    sourceChain: string,
    destinationChain: string,
    windowDays?: number,
  ): FeeComparisonEntry | null {
    return this.compareFees(sourceChain, destinationChain, windowDays).cheapest;
  }

  /**
   * Rank all bridges across all routes by their aggregate average fee,
   * cheapest first.
   */
  rankAllBridgesByCost(windowDays?: number): Array<{
    bridgeId: string;
    bridgeType: BridgeType;
    averageFeeUsd: number;
    sampleCount: number;
  }> {
    const days = windowDays ?? this.windowDays;
    const cutoff = cutoffDate(days);
    const window = this.records.filter((r) => r.timestamp >= cutoff);

    const byBridge = groupBy(window, (r) => r.bridgeId);
    return Object.entries(byBridge)
      .map(([bridgeId, recs]) => ({
        bridgeId,
        bridgeType: recs[0].bridgeType,
        averageFeeUsd: round(mean(recs.map((r) => r.feeUsd))),
        sampleCount: recs.length,
      }))
      .sort((a, b) => a.averageFeeUsd - b.averageFeeUsd);
  }

  /**
   * Returns a map of bridgeId → average fee USD across all recorded routes
   * within the rolling window.
   */
  aggregateFeesByBridge(windowDays?: number): Map<string, number> {
    const ranking = this.rankAllBridgesByCost(windowDays);
    return new Map(ranking.map((e) => [e.bridgeId, e.averageFeeUsd]));
  }

  // ─── Maintenance ───────────────────────────────────────────────────────────

  /** Remove all records older than `days`. Returns the count removed. */
  pruneOlderThan(days: number): number {
    const cutoff = cutoffDate(days);
    const before = this.records.length;
    this.records = this.records.filter((r) => r.timestamp >= cutoff);
    return before - this.records.length;
  }

  /** Remove all stored records. */
  clearRecords(): void {
    this.records = [];
  }

  /** Total number of stored records. */
  get totalRecords(): number {
    return this.records.length;
  }

  // ─── Private ───────────────────────────────────────────────────────────────

  private getWindowRecords(
    sourceChain: string,
    destinationChain: string,
    days: number,
  ): BridgeFeeRecord[] {
    const cutoff = cutoffDate(days);
    return this.records.filter(
      (r) =>
        r.sourceChain === sourceChain &&
        r.destinationChain === destinationChain &&
        r.timestamp >= cutoff,
    );
  }

  private pruneBridge(bridgeId: string): void {
    if (this.maxRecordsPerBridge === Infinity) return;

    const bridgeRecords = this.records
      .filter((r) => r.bridgeId === bridgeId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (bridgeRecords.length > this.maxRecordsPerBridge) {
      const toRemove = new Set(
        bridgeRecords
          .slice(0, bridgeRecords.length - this.maxRecordsPerBridge)
          .map((r) => r.id),
      );
      this.records = this.records.filter((r) => !toRemove.has(r.id));
    }
  }
}

// ─── Pure Helpers ─────────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function round(value: number, decimals = 4): number {
  return Number(value.toFixed(decimals));
}

function cutoffDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  return items.reduce<Record<string, T[]>>((acc, item) => {
    const key = keyFn(item);
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});
}
