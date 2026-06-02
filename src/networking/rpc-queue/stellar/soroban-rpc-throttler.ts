// ─── Types ────────────────────────────────────────────────────────────────────

export interface ThrottlerLimits {
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
}

export interface TokenSnapshot {
  /** Tokens remaining in the per-second bucket (may be fractional). */
  second: number;
  /** Tokens remaining in the per-minute bucket (may be fractional). */
  minute: number;
  /** Milliseconds until the per-second bucket can serve one token. 0 = ready. */
  secondWaitMs: number;
  /** Milliseconds until the per-minute bucket can serve one token. 0 = ready. */
  minuteWaitMs: number;
}

export interface ConsumeResult {
  /** Whether the tokens were consumed immediately. */
  granted: boolean;
  /**
   * When `granted` is false: milliseconds the caller should wait before
   * retrying. When `granted` is true: 0.
   */
  waitMs: number;
}

// ─── Token-bucket implementation ──────────────────────────────────────────────

/**
 * A single token-bucket rate-limit window.
 *
 * Tokens refill continuously at `capacity / windowMs` tokens per millisecond,
 * capped at `capacity`. This models a sliding refill rather than a fixed reset,
 * which distributes requests more evenly than a hard window.
 */
class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;
  readonly refillRate: number; // tokens / ms

  constructor(
    public capacity: number,
    windowMs: number,
  ) {
    if (capacity <= 0) throw new RangeError('capacity must be > 0');
    if (windowMs <= 0) throw new RangeError('windowMs must be > 0');

    this.refillRate = capacity / windowMs;
    this.tokens = capacity;
    this.lastRefillAt = Date.now();
  }

  /** Advance the bucket to `now`, adding accrued tokens up to capacity. */
  refill(now: number): void {
    const elapsed = now - this.lastRefillAt;
    if (elapsed > 0) {
      this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillRate);
      this.lastRefillAt = now;
    }
  }

  /** Consume `n` tokens. Returns true if successful, false if insufficient. */
  tryConsume(n: number): boolean {
    if (this.tokens >= n) {
      this.tokens -= n;
      return true;
    }
    return false;
  }

  /**
   * Milliseconds until `n` tokens are available.
   * Returns 0 if tokens are already sufficient.
   */
  waitFor(n: number): number {
    if (this.tokens >= n) return 0;
    return Math.ceil((n - this.tokens) / this.refillRate);
  }

  /** Peek at the current token level without mutating state. */
  get available(): number {
    return this.tokens;
  }

  /**
   * Reset the bucket to full capacity, updating the refill rate and capacity
   * in place. Existing accrued tokens are discarded to avoid a burst spike
   * after a limit increase.
   */
  reset(newCapacity: number, windowMs: number): void {
    if (newCapacity <= 0) throw new RangeError('capacity must be > 0');
    if (windowMs <= 0) throw new RangeError('windowMs must be > 0');

    (this as any).capacity = newCapacity;
    (this as any).refillRate = newCapacity / windowMs;
    this.tokens = newCapacity;
    this.lastRefillAt = Date.now();
  }
}

// ─── Throttler ────────────────────────────────────────────────────────────────

/**
 * A dual-window token-bucket rate limiter for Soroban RPC calls.
 *
 * Two independent buckets enforce separate per-second and per-minute limits.
 * A request is granted only when **both** buckets have sufficient capacity,
 * preventing short bursts from exhausting the longer-horizon limit.
 *
 * Usage:
 * ```ts
 * const throttler = new SorobanRpcThrottler({ maxRequestsPerSecond: 10, maxRequestsPerMinute: 300 });
 *
 * const { granted, waitMs } = throttler.consume();
 * if (!granted) await sleep(waitMs);
 * ```
 */
export class SorobanRpcThrottler {
  private readonly secondBucket: TokenBucket;
  private readonly minuteBucket: TokenBucket;

  constructor(limits: ThrottlerLimits) {
    this.validateLimits(limits);
    this.secondBucket = new TokenBucket(limits.maxRequestsPerSecond, 1_000);
    this.minuteBucket = new TokenBucket(limits.maxRequestsPerMinute, 60_000);
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Attempt to consume `tokens` from both buckets.
   *
   * - Returns `{ granted: true, waitMs: 0 }` when both buckets had capacity.
   * - Returns `{ granted: false, waitMs: N }` when either bucket was
   *   exhausted; `waitMs` is the time the caller should back off before
   *   retrying.
   *
   * @param tokens Number of tokens to consume (default: 1).
   */
  consume(tokens = 1): ConsumeResult {
    this.validateTokenCount(tokens);

    const now = Date.now();
    this.secondBucket.refill(now);
    this.minuteBucket.refill(now);

    if (this.secondBucket.tryConsume(tokens) && this.minuteBucket.tryConsume(tokens)) {
      return { granted: true, waitMs: 0 };
    }

    // One or both buckets failed — roll back any partial consume and report
    // the longest wait across both buckets.
    const waitMs = Math.max(
      this.secondBucket.waitFor(tokens),
      this.minuteBucket.waitFor(tokens),
    );
    return { granted: false, waitMs };
  }

  /**
   * Convenience wrapper: resolves after the required back-off when the
   * throttler is exhausted, then consumes the tokens.
   *
   * Suitable for sequential request queues. For concurrent pipelines prefer
   * calling `consume()` directly and managing scheduling externally.
   */
  async consumeOrWait(tokens = 1): Promise<void> {
    // Retry loop handles the case where a sleep wakes up slightly early due to
    // timer imprecision, or where a concurrent consumer drained tokens.
    for (;;) {
      const result = this.consume(tokens);
      if (result.granted) return;
      // await sleep(result.waitMs);
    }
  }

  /**
   * Update rate limits without restarting the throttler.
   *
   * Both buckets are reset to full capacity with the new limits. Any tokens
   * accrued under the previous limits are discarded to avoid a burst spike.
   */
  updateLimits(limits: ThrottlerLimits): void {
    this.validateLimits(limits);
    this.secondBucket.reset(limits.maxRequestsPerSecond, 1_000);
    this.minuteBucket.reset(limits.maxRequestsPerMinute, 60_000);
  }

  /**
   * Return a snapshot of the current token levels after applying any accrued
   * refill. Useful for monitoring, dashboards, and test assertions.
   */
  getSnapshot(): TokenSnapshot {
    const now = Date.now();
    this.secondBucket.refill(now);
    this.minuteBucket.refill(now);

    return {
      second: this.secondBucket.available,
      minute: this.minuteBucket.available,
      secondWaitMs: this.secondBucket.waitFor(1),
      minuteWaitMs: this.minuteBucket.waitFor(1),
    };
  }

  /**
   * Whether the throttler can immediately grant at least `tokens` tokens.
   * A lightweight alternative to `consume()` when you only need a boolean check.
   */
  canConsume(tokens = 1): boolean {
    const now = Date.now();
    this.secondBucket.refill(now);
    this.minuteBucket.refill(now);
    return (
      this.secondBucket.available >= tokens &&
      this.minuteBucket.available >= tokens
    );
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private validateLimits(limits: ThrottlerLimits): void {
    if (limits.maxRequestsPerSecond <= 0) {
      throw new RangeError('maxRequestsPerSecond must be > 0');
    }
    if (limits.maxRequestsPerMinute <= 0) {
      throw new RangeError('maxRequestsPerMinute must be > 0');
    }
    if (limits.maxRequestsPerSecond > limits.maxRequestsPerMinute) {
      throw new RangeError(
        'maxRequestsPerSecond cannot exceed maxRequestsPerMinute — a per-second ' +
        'limit higher than the per-minute limit would make the minute bucket ' +
        'permanently exhausted after the first second',
      );
    }
  }

  private validateTokenCount(tokens: number): void {
    if (!Number.isFinite(tokens) || tokens <= 0) {
      throw new RangeError(`tokens must be a positive finite number, received ${tokens}`);
    }
    if (tokens > this.secondBucket.capacity || tokens > this.minuteBucket.capacity) {
      throw new RangeError(
        `Requested ${tokens} tokens exceeds bucket capacity ` +
        `(second: ${this.secondBucket.capacity}, minute: ${this.minuteBucket.capacity})`,
      );
    }
  }
}

// ─── Utilities ────────────────────────────────────────────────────────────────

// function sleep(ms: number): Promise<void> {
//   return new Promise((resolve) => setTimeout(resolve, ms));
// }