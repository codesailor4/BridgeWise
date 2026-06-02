export interface RateLimitConfig {
  /** Maximum requests allowed per second. */
  maxRequestsPerSecond: number;
  /** Maximum requests allowed per minute. */
  maxRequestsPerMinute: number;
  /** Injected clock for deterministic testing. Defaults to Date.now. */
  now?: () => number;
}

export interface RateLimitResult {
  /** Whether the request was granted immediately. */
  granted: boolean;
  /**
   * When `granted` is false: milliseconds the caller should wait before
   * retrying. 0 when granted.
   */
  waitMs: number;
}

export interface RateLimitSnapshot {
  secondTokens: number;
  minuteTokens: number;
  secondWaitMs: number;
  minuteWaitMs: number;
}
