import { StellarBridgeRateLimiter } from './stellar-bridge-rate-limiter';

describe('StellarBridgeRateLimiter', () => {
  // ─── Constructor validation ───────────────────────────────────────────────

  it('throws when maxRequestsPerSecond <= 0', () => {
    expect(() => new StellarBridgeRateLimiter({ maxRequestsPerSecond: 0, maxRequestsPerMinute: 60 })).toThrow(RangeError);
  });

  it('throws when maxRequestsPerMinute <= 0', () => {
    expect(() => new StellarBridgeRateLimiter({ maxRequestsPerSecond: 1, maxRequestsPerMinute: 0 })).toThrow(RangeError);
  });

  it('throws when per-second limit exceeds per-minute limit', () => {
    expect(() => new StellarBridgeRateLimiter({ maxRequestsPerSecond: 100, maxRequestsPerMinute: 60 })).toThrow(RangeError);
  });

  // ─── consume (fresh bucket) ───────────────────────────────────────────────

  it('grants requests within both limits', () => {
    let now = 0;
    const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 5, maxRequestsPerMinute: 30, now: () => now });

    for (let i = 0; i < 5; i++) {
      expect(limiter.consume()).toEqual({ granted: true, waitMs: 0 });
    }
  });

  it('denies request when per-second bucket is exhausted', () => {
    let now = 0;
    const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 2, maxRequestsPerMinute: 60, now: () => now });

    limiter.consume();
    limiter.consume();
    const result = limiter.consume();

    expect(result.granted).toBe(false);
    expect(result.waitMs).toBeGreaterThan(0);
  });

  it('throws when token count is not positive', () => {
    const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 10, maxRequestsPerMinute: 60 });
    expect(() => limiter.consume(0)).toThrow(RangeError);
    expect(() => limiter.consume(-1)).toThrow(RangeError);
  });

  // ─── canConsume ───────────────────────────────────────────────────────────

  it('returns true when capacity is available', () => {
    const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 10, maxRequestsPerMinute: 60 });
    expect(limiter.canConsume()).toBe(true);
  });

  it('returns false after exhausting the per-second bucket', () => {
    let now = 0;
    const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 2, maxRequestsPerMinute: 60, now: () => now });

    limiter.consume();
    limiter.consume();

    expect(limiter.canConsume()).toBe(false);
  });

  // ─── refill behaviour ─────────────────────────────────────────────────────

  it('refills the per-second bucket after 1 second', () => {
    let now = 0;
    const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 2, maxRequestsPerMinute: 60, now: () => now });

    limiter.consume();
    limiter.consume();
    expect(limiter.canConsume()).toBe(false);

    now = 1_000;
    expect(limiter.canConsume()).toBe(true);
  });

  // ─── updateLimits ─────────────────────────────────────────────────────────

  it('updates limits and resets buckets to full capacity', () => {
    let now = 0;
    const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 2, maxRequestsPerMinute: 60, now: () => now });

    limiter.consume();
    limiter.consume();
    expect(limiter.canConsume()).toBe(false);

    limiter.updateLimits({ maxRequestsPerSecond: 5, maxRequestsPerMinute: 120 });
    expect(limiter.canConsume()).toBe(true);
  });

  it('throws on invalid limits in updateLimits', () => {
    const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 5, maxRequestsPerMinute: 60 });
    expect(() => limiter.updateLimits({ maxRequestsPerSecond: 0, maxRequestsPerMinute: 60 })).toThrow(RangeError);
  });

  // ─── getSnapshot ──────────────────────────────────────────────────────────

  it('returns a snapshot of current token levels', () => {
    let now = 0;
    const limiter = new StellarBridgeRateLimiter({ maxRequestsPerSecond: 5, maxRequestsPerMinute: 30, now: () => now });

    limiter.consume();
    const snap = limiter.getSnapshot();

    expect(snap.secondTokens).toBeCloseTo(4);
    expect(snap.minuteTokens).toBeCloseTo(29);
    expect(snap.secondWaitMs).toBe(0);
    expect(snap.minuteWaitMs).toBe(0);
  });
});
