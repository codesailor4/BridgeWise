import {
  RateLimitConfig,
  RateLimitResult,
  RateLimitSnapshot,
} from './stellar-bridge-rate-limiter.types';

class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;
  readonly refillRate: number;

  constructor(
    public capacity: number,
    windowMs: number,
    private readonly clock: () => number,
  ) {
    if (capacity <= 0) throw new RangeError('capacity must be > 0');
    if (windowMs <= 0) throw new RangeError('windowMs must be > 0');

    this.refillRate = capacity / windowMs;
    this.tokens = capacity;
    this.lastRefillAt = clock();
  }

  refill(): void {
    const now = this.clock();
    const elapsed = now - this.lastRefillAt;
    if (elapsed > 0) {
      this.tokens = Math.min(
        this.capacity,
        this.tokens + elapsed * this.refillRate,
      );
      this.lastRefillAt = now;
    }
  }

  tryConsume(n: number): boolean {
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  waitFor(n: number): number {
    if (this.tokens >= n) return 0;
    return Math.ceil((n - this.tokens) / this.refillRate);
  }

  get available(): number {
    return this.tokens;
  }

  reset(newCapacity: number, windowMs: number): void {
    if (newCapacity <= 0) throw new RangeError('capacity must be > 0');
    if (windowMs <= 0) throw new RangeError('windowMs must be > 0');

    (this as any).capacity = newCapacity;
    (this as any).refillRate = newCapacity / windowMs;
    this.tokens = newCapacity;
    this.lastRefillAt = this.clock();
  }
}

/**
 * Dual-window token-bucket rate limiter for Stellar bridge API requests.
 *
 * Two independent buckets enforce per-second and per-minute limits. A request
 * is granted only when **both** buckets have capacity, preventing short bursts
 * from exhausting the longer-horizon limit.
 *
 * Usage:
 *   const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 10, maxRequestsPerMinute: 300 });
 *   const { granted, waitMs } = limiter.consume();
 *   if (!granted) await sleep(waitMs);
 */
export class StellarBridgeRateLimiter {
  private readonly secondBucket: TokenBucket;
  private readonly minuteBucket: TokenBucket;
  private readonly clock: () => number;

  constructor(config: RateLimitConfig) {
    this.validateConfig(config);
    this.clock = config.now ?? (() => Date.now());
    this.secondBucket = new TokenBucket(
      config.maxRequestsPerSecond,
      1_000,
      this.clock,
    );
    this.minuteBucket = new TokenBucket(
      config.maxRequestsPerMinute,
      60_000,
      this.clock,
    );
  }

  /**
   * Attempt to consume `tokens` from both buckets atomically.
   *
   * Returns `{ granted: true, waitMs: 0 }` when capacity is available, or
   * `{ granted: false, waitMs: N }` with the longer of the two wait times.
   */
  consume(tokens = 1): RateLimitResult {
    this.validateTokenCount(tokens);

    this.secondBucket.refill();
    this.minuteBucket.refill();

    if (
      this.secondBucket.tryConsume(tokens) &&
      this.minuteBucket.tryConsume(tokens)
    ) {
      return { granted: true, waitMs: 0 };
    }

    const waitMs = Math.max(
      this.secondBucket.waitFor(tokens),
      this.minuteBucket.waitFor(tokens),
    );
    return { granted: false, waitMs };
  }

  /**
   * Update rate limits in-place without restarting the limiter.
   *
   * Both buckets are reset to full capacity with the new limits.
   */
  updateLimits(config: Omit<RateLimitConfig, 'now'>): void {
    this.validateConfig({ ...config, now: this.clock });
    this.secondBucket.reset(config.maxRequestsPerSecond, 1_000);
    this.minuteBucket.reset(config.maxRequestsPerMinute, 60_000);
  }

  /**
   * Snapshot of current token levels after applying any accrued refill.
   * Useful for monitoring and assertions.
   */
  getSnapshot(): RateLimitSnapshot {
    this.secondBucket.refill();
    this.minuteBucket.refill();

    return {
      secondTokens: this.secondBucket.available,
      minuteTokens: this.minuteBucket.available,
      secondWaitMs: this.secondBucket.waitFor(1),
      minuteWaitMs: this.minuteBucket.waitFor(1),
    };
  }

  /** Whether the limiter can immediately grant `tokens` without waiting. */
  canConsume(tokens = 1): boolean {
    this.secondBucket.refill();
    this.minuteBucket.refill();
    return (
      this.secondBucket.available >= tokens &&
      this.minuteBucket.available >= tokens
    );
  }

  private validateConfig(config: RateLimitConfig): void {
    if (config.maxRequestsPerSecond <= 0) {
      throw new RangeError('maxRequestsPerSecond must be > 0');
    }
    if (config.maxRequestsPerMinute <= 0) {
      throw new RangeError('maxRequestsPerMinute must be > 0');
    }
    if (config.maxRequestsPerSecond > config.maxRequestsPerMinute) {
      throw new RangeError(
        'maxRequestsPerSecond cannot exceed maxRequestsPerMinute',
      );
    }
  }

  private validateTokenCount(tokens: number): void {
    if (!Number.isFinite(tokens) || tokens <= 0) {
      throw new RangeError(
        `tokens must be a positive finite number, received ${tokens}`,
      );
    }
  }
}
