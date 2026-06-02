/**
 * Stellar route simulation cache — Issue #364.
 *
 * Soroban route simulations (path-payment quotes, swap previews, fee
 * projections) are deterministic for a short window: identical inputs return
 * the same numbers until ledger state moves. This cache reuses those results
 * across repeated queries to cut down on Horizon/Soroban-RPC round-trips.
 *
 * The shape mirrors the sibling `StellarReplayProtectionCache` in
 * `src/cache/replay/stellar` — a Map-backed, TTL-bounded, LRU-evicting store
 * with a background cleanup timer. Several invalidation strategies are
 * supported so callers can flush narrowly (by route, by predicate) instead of
 * blasting the whole cache.
 */

/** Inputs that fully describe a route simulation request. */
export interface SimulationKeyInput {
  sourceAsset: string;
  destinationAsset: string;
  /** Stroop amount serialised as a string to avoid bigint/number ambiguity. */
  sourceAmount: string;
  network: string;
}

export interface SimulationCacheEntry<T> {
  key: string;
  input: SimulationKeyInput;
  result: T;
  /** Ms since epoch when the entry was stored. */
  cachedAt: number;
}

export interface SimulationCacheConfig {
  maxEntries: number;
  ttlMs: number;
  cleanupIntervalMs: number;
}

const DEFAULT_CONFIG: SimulationCacheConfig = {
  maxEntries: 1_000,
  ttlMs: 30 * 1_000, // simulations go stale quickly — 30s
  cleanupIntervalMs: 60 * 1_000,
};

/** Build the deterministic cache key for a simulation. Exported for tests. */
export function buildSimulationKey(input: SimulationKeyInput): string {
  return [
    input.network,
    input.sourceAsset,
    input.destinationAsset,
    input.sourceAmount,
  ].join('|');
}

export class StellarRouteSimulationCache<T = unknown> {
  private cache: Map<string, SimulationCacheEntry<T>> = new Map();
  private readonly config: SimulationCacheConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<SimulationCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startCleanup();
  }

  /** Look up a cached simulation result; returns null on miss or expiry. */
  get(input: SimulationKeyInput, now: number = Date.now()): T | null {
    const key = buildSimulationKey(input);
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (this.isExpired(entry, now)) {
      this.cache.delete(key);
      return null;
    }
    return entry.result;
  }

  /** Insert/replace a simulation result. Evicts the oldest entry if full. */
  set(input: SimulationKeyInput, result: T, now: number = Date.now()): void {
    const key = buildSimulationKey(input);
    if (!this.cache.has(key) && this.cache.size >= this.config.maxEntries) {
      this.evictOldest();
    }
    this.cache.set(key, { key, input, result, cachedAt: now });
  }

  /** True iff a fresh (non-expired) entry exists for this key. */
  has(input: SimulationKeyInput, now: number = Date.now()): boolean {
    const entry = this.cache.get(buildSimulationKey(input));
    return entry !== undefined && !this.isExpired(entry, now);
  }

  // ── Invalidation strategies ────────────────────────────────────────────

  /** Invalidate a specific (source, destination, amount, network) entry. */
  invalidate(input: SimulationKeyInput): boolean {
    return this.cache.delete(buildSimulationKey(input));
  }

  /** Invalidate every entry on the given network (e.g. on ledger reorg). */
  invalidateNetwork(network: string): number {
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (entry.input.network === network) {
        this.cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Invalidate every entry touching the given asset (source or destination). */
  invalidateAsset(asset: string): number {
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (entry.input.sourceAsset === asset || entry.input.destinationAsset === asset) {
        this.cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Invalidate every entry for which the predicate returns true. */
  invalidateBy(predicate: (entry: SimulationCacheEntry<T>) => boolean): number {
    let removed = 0;
    for (const [key, entry] of this.cache) {
      if (predicate(entry)) {
        this.cache.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  /** Drop every entry. */
  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  /** Stop the background cleanup timer. */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private isExpired(entry: SimulationCacheEntry<T>, now: number): boolean {
    return now - entry.cachedAt > this.config.ttlMs;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.cachedAt < oldestTime) {
        oldestTime = entry.cachedAt;
        oldestKey = key;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [key, entry] of this.cache) {
        if (this.isExpired(entry, now)) {
          this.cache.delete(key);
        }
      }
    }, this.config.cleanupIntervalMs);
    // Don't hold the event loop open just for the cleanup timer.
    if (typeof (this.cleanupTimer as { unref?: () => void }).unref === 'function') {
      (this.cleanupTimer as { unref: () => void }).unref();
    }
  }
}
