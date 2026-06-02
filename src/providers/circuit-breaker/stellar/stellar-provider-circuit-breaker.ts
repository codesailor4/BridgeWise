// ─── Types ────────────────────────────────────────────────────────────────────

export type CircuitState = "closed" | "open" | "half_open";

export interface CircuitBreakerOptions {
  /** Consecutive failures that trip the breaker open. Default 5. */
  failureThreshold?: number;
  /** Cooldown (ms) before a tripped breaker allows a trial request. Default 30_000. */
  resetTimeoutMs?: number;
  /**
   * Success streak required in HALF_OPEN before the breaker fully closes.
   * Default 1 (original behaviour — a single success closes immediately).
   * Increase for noisier providers where one success isn't reliable signal.
   */
  halfOpenSuccessThreshold?: number;
  /** Injectable clock for deterministic testing. Defaults to Date.now. */
  now?: () => number;
  /** Called whenever the breaker transitions between states. */
  onStateChange?: (event: StateChangeEvent) => void;
}

export interface StateChangeEvent {
  providerId?: string;
  from: CircuitState;
  to: CircuitState;
  /** Epoch ms at the moment of the transition. */
  at: number;
  /** Consecutive failure count at the moment of the transition. */
  consecutiveFailures: number;
}

export interface BreakerSnapshot {
  state: CircuitState;
  consecutiveFailures: number;
  /** Epoch ms when the breaker was last tripped open. 0 if never opened. */
  openedAt: number;
  /**
   * Milliseconds remaining in the cooldown, or 0 if the breaker is not open
   * or the cooldown has already elapsed.
   */
  cooldownRemainingMs: number;
  /** Consecutive successes accumulated while HALF_OPEN. */
  halfOpenSuccesses: number;
}

// ─── CircuitBreaker ───────────────────────────────────────────────────────────

/**
 * Single-provider token-bucket circuit breaker with configurable HALF_OPEN
 * success threshold and state-change hooks.
 *
 * State machine:
 *
 *   CLOSED ──(failures ≥ threshold)──► OPEN
 *   OPEN   ──(cooldown elapsed)──────► HALF_OPEN
 *   HALF_OPEN ──(success streak met)─► CLOSED
 *   HALF_OPEN ──(any failure)────────► OPEN
 */
export class CircuitBreaker {
  private state: CircuitState = "closed";
  private consecutiveFailures = 0;
  private halfOpenSuccesses = 0;
  private openedAt = 0;

  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;
  private readonly now: () => number;
  private readonly onStateChange?: (event: StateChangeEvent) => void;

  /** Provided externally by the registry so event logs include the provider id. */
  providerId?: string;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 30_000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 1;
    this.now = options.now ?? (() => Date.now());
    this.onStateChange = options.onStateChange;

    if (this.failureThreshold < 1) {
      throw new RangeError("failureThreshold must be ≥ 1");
    }
    if (this.resetTimeoutMs < 0) {
      throw new RangeError("resetTimeoutMs must be ≥ 0");
    }
    if (this.halfOpenSuccessThreshold < 1) {
      throw new RangeError("halfOpenSuccessThreshold must be ≥ 1");
    }
  }

  // ─── State ──────────────────────────────────────────────────────────────

  /**
   * Current breaker state, accounting for an elapsed cooldown.
   * Calling this may trigger an OPEN → HALF_OPEN transition.
   */
  getState(): CircuitState {
    if (
      this.state === "open" &&
      this.now() - this.openedAt >= this.resetTimeoutMs
    ) {
      this.transition("half_open");
    }
    return this.state;
  }

  /** Whether a request may be dispatched to this provider right now. */
  canRequest(): boolean {
    return this.getState() !== "open";
  }

  // ─── Outcome recording ───────────────────────────────────────────────────

  recordSuccess(): void {
    const current = this.getState();

    if (current === "half_open") {
      this.halfOpenSuccesses += 1;
      if (this.halfOpenSuccesses >= this.halfOpenSuccessThreshold) {
        this.consecutiveFailures = 0;
        this.halfOpenSuccesses = 0;
        this.transition("closed");
      }
      return;
    }

    // CLOSED — reset failure streak
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
  }

  recordFailure(): void {
    const current = this.getState();

    if (current === "half_open") {
      // Any failure in HALF_OPEN re-opens immediately
      this.halfOpenSuccesses = 0;
      this.trip();
      return;
    }

    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.trip();
    }
  }

  // ─── Inspection ─────────────────────────────────────────────────────────

  /** Full read-only snapshot of the breaker's internal counters. */
  getSnapshot(): BreakerSnapshot {
    const state = this.getState();
    const elapsed = this.openedAt > 0 ? this.now() - this.openedAt : 0;
    const cooldownRemainingMs =
      state === "open"
        ? Math.max(0, this.resetTimeoutMs - elapsed)
        : 0;

    return {
      state,
      consecutiveFailures: this.consecutiveFailures,
      openedAt: this.openedAt,
      cooldownRemainingMs,
      halfOpenSuccesses: this.halfOpenSuccesses,
    };
  }

  /** Reset the breaker to CLOSED with all counters zeroed. */
  reset(): void {
    const prev = this.state;
    this.consecutiveFailures = 0;
    this.halfOpenSuccesses = 0;
    this.openedAt = 0;
    if (prev !== "closed") this.transition("closed");
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private trip(): void {
    this.openedAt = this.now();
    this.transition("open");
  }

  private transition(to: CircuitState): void {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.onStateChange?.({
      providerId: this.providerId,
      from,
      to,
      at: this.now(),
      consecutiveFailures: this.consecutiveFailures,
    });
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

export interface ProviderStatus {
  providerId: string;
  snapshot: BreakerSnapshot;
}

/**
 * Registry that manages one `CircuitBreaker` per Stellar bridge provider.
 *
 * Breakers are created lazily on first contact. The registry exposes both
 * outcome reporting and routing helpers so the call-site stays thin.
 */
export class StellarProviderCircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly options: CircuitBreakerOptions = {}) {
    this.validateOptions(options);
  }

  // ─── Outcome reporting ───────────────────────────────────────────────────

  /** Record the outcome of a provider call. */
  report(providerId: string, ok: boolean): void {
    const breaker = this.breakerFor(providerId);
    if (ok) breaker.recordSuccess();
    else breaker.recordFailure();
  }

  /** Convenience wrapper for a successful call. */
  reportSuccess(providerId: string): void {
    this.breakerFor(providerId).recordSuccess();
  }

  /** Convenience wrapper for a failed call. */
  reportFailure(providerId: string): void {
    this.breakerFor(providerId).recordFailure();
  }

  // ─── Routing helpers ─────────────────────────────────────────────────────

  isAvailable(providerId: string): boolean {
    return this.breakerFor(providerId).canRequest();
  }

  /**
   * Filter a candidate list down to providers whose breaker is not OPEN.
   * Order is preserved so the caller's priority ranking is respected.
   */
  availableProviders(providerIds: string[]): string[] {
    return providerIds.filter((id) => this.isAvailable(id));
  }

  /**
   * Select the first available provider from an ordered list.
   * Returns `null` when all providers are suspended.
   */
  selectProvider(providerIds: string[]): string | null {
    return this.availableProviders(providerIds)[0] ?? null;
  }

  // ─── Inspection ─────────────────────────────────────────────────────────

  /** Providers whose breaker is currently OPEN (suspended). */
  suspendedProviders(): string[] {
    return this.allStatuses()
      .filter(({ snapshot }) => snapshot.state === "open")
      .map(({ providerId }) => providerId);
  }

  /** Full snapshot of every known provider, sorted by provider id. */
  allStatuses(): ProviderStatus[] {
    return [...this.breakers.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([providerId, breaker]) => ({
        providerId,
        snapshot: breaker.getSnapshot(),
      }));
  }

  /** Snapshot for a single provider, or `null` if it has never been contacted. */
  statusFor(providerId: string): ProviderStatus | null {
    const breaker = this.breakers.get(providerId);
    if (!breaker) return null;
    return { providerId, snapshot: breaker.getSnapshot() };
  }

  /** Manually reset a provider's breaker to CLOSED. Useful for operator overrides. */
  resetProvider(providerId: string): void {
    this.breakers.get(providerId)?.reset();
  }

  /** Reset all breakers. */
  resetAll(): void {
    for (const breaker of this.breakers.values()) breaker.reset();
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private breakerFor(providerId: string): CircuitBreaker {
    let breaker = this.breakers.get(providerId);
    if (!breaker) {
      breaker = new CircuitBreaker(this.options);
      breaker.providerId = providerId;
      this.breakers.set(providerId, breaker);
    }
    return breaker;
  }

  private validateOptions(options: CircuitBreakerOptions): void {
    if (
      options.failureThreshold !== undefined &&
      options.failureThreshold < 1
    ) {
      throw new RangeError("failureThreshold must be ≥ 1");
    }
    if (
      options.resetTimeoutMs !== undefined &&
      options.resetTimeoutMs < 0
    ) {
      throw new RangeError("resetTimeoutMs must be ≥ 0");
    }
  }
}