import {
  CircuitBreaker,
  StellarProviderCircuitBreakerRegistry,
} from "./stellar-provider-circuit-breaker";

describe("CircuitBreaker", () => {
  it("opens after the failure threshold and blocks requests", () => {
    const breaker = new CircuitBreaker({ failureThreshold: 3, now: () => 0 });
    expect(breaker.canRequest()).toBe(true);
    breaker.recordFailure();
    breaker.recordFailure();
    expect(breaker.getState()).toBe("closed");
    breaker.recordFailure(); // 3rd consecutive failure trips it
    expect(breaker.getState()).toBe("open");
    expect(breaker.canRequest()).toBe(false);
  });

  it("moves to half-open after the cooldown and closes on success", () => {
    let clock = 1000;
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 500, now: () => clock });
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");

    clock += 500; // cooldown elapses
    expect(breaker.getState()).toBe("half_open");
    expect(breaker.canRequest()).toBe(true);

    breaker.recordSuccess();
    expect(breaker.getState()).toBe("closed");
  });

  it("re-opens immediately when a half-open trial fails", () => {
    let clock = 0;
    const breaker = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 100, now: () => clock });
    breaker.recordFailure();
    clock += 100;
    expect(breaker.getState()).toBe("half_open");
    breaker.recordFailure();
    expect(breaker.getState()).toBe("open");
  });
});

describe("StellarProviderCircuitBreakerRegistry", () => {
  it("suspends an unhealthy provider and filters availability", () => {
    const registry = new StellarProviderCircuitBreakerRegistry({ failureThreshold: 2, now: () => 0 });
    registry.report("horizon-a", false);
    registry.report("horizon-a", false); // trips horizon-a
    registry.report("horizon-b", true);

    expect(registry.isAvailable("horizon-a")).toBe(false);
    expect(registry.isAvailable("horizon-b")).toBe(true);
    expect(registry.availableProviders(["horizon-a", "horizon-b"])).toEqual(["horizon-b"]);
    expect(registry.suspendedProviders()).toEqual(["horizon-a"]);
  });
});
