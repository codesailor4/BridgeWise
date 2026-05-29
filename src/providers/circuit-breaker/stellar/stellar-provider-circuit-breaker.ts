/**
 * Circuit breaker for Stellar bridge providers.
 *
 * Repeated failures from a provider trip its breaker OPEN, so routing skips it
 * until a cooldown elapses; a single trial request (HALF_OPEN) then decides
 * whether to close it again. A registry tracks one breaker per provider id so
 * unhealthy providers are suspended automatically.
 */

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker open. Default 5. */
  failureThreshold?: number;
  /** Cooldown (ms) before a tripped breaker allows a trial request. Default 30_000. */
  resetTimeoutMs?: number;
  /** Injectable clock for testing. Defaults to Date.now. */
  now?: () => number;
}

export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly now: () => number;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.now = options.now ?? (() => Date.now());
  }

  /** Current breaker state, accounting for an elapsed cooldown. */
  getState(): CircuitState {
    if (this.state === "open" && this.now() - this.openedAt >= this.resetTimeoutMs) {
      this.state = "half_open";
    }
    return this.state;
  }

  /** Whether a request may be sent to the provider right now. */
  canRequest(): boolean {
    return this.getState() !== "open";
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = "closed";
  }

  recordFailure(): void {
    this.consecutiveFailures += 1;
    // A failed trial in half-open re-opens immediately; otherwise trip once the
    // consecutive-failure threshold is reached.
    if (this.getState() === "half_open" || this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = this.now();
    }
  }
}

export class StellarProviderCircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly options: CircuitBreakerOptions = {}) {}

  private breakerFor(providerId: string): CircuitBreaker {
    let breaker = this.breakers.get(providerId);
    if (!breaker) {
      breaker = new CircuitBreaker(this.options);
      this.breakers.set(providerId, breaker);
    }
    return breaker;
  }

  /** Record the outcome of a provider call. */
  report(providerId: string, ok: boolean): void {
    const breaker = this.breakerFor(providerId);
    if (ok) breaker.recordSuccess();
    else breaker.recordFailure();
  }

  isAvailable(providerId: string): boolean {
    return this.breakerFor(providerId).canRequest();
  }

  /** Filter a candidate provider list down to those currently available. */
  availableProviders(providerIds: string[]): string[] {
    return providerIds.filter((id) => this.isAvailable(id));
  }

  /** Providers whose breaker is currently open (suspended). */
  suspendedProviders(): string[] {
    const suspended: string[] = [];
    for (const [id, breaker] of this.breakers) {
      if (breaker.getState() === "open") suspended.push(id);
    }
    return suspended;
  }
}
