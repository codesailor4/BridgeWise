import {
  normalizeProviderResponse,
  aggregateRoutes,
  bestRoute,
  type RawProviderResponse,
} from "./stellar-route-aggregator";

const providerA: RawProviderResponse = {
  providerId: "provider-a",
  sourceAsset: "USDC",
  destAsset: "XLM",
  routes: [
    { amountIn: "100", amountOut: "98.0", fee: "2", path: ["USDC", "XLM"] },
    { inputAmount: "100", outputAmount: 95, feeAmount: 1, hops: 2 },
    { amountIn: "100" }, // malformed: no output → dropped
  ],
};

const providerB: RawProviderResponse = {
  providerId: "provider-b",
  sourceAsset: "USDC",
  destAsset: "XLM",
  routes: [{ estimatedReceive: "99.5", fee: "0.5", etaSeconds: 6 }],
};

describe("normalizeProviderResponse", () => {
  it("maps varied field names into the common shape and drops malformed routes", () => {
    const routes = normalizeProviderResponse(providerA);
    expect(routes).toHaveLength(2); // third route dropped
    expect(routes[0]).toMatchObject({
      providerId: "provider-a",
      outputAmount: "98.0",
      feeAmount: "2",
      inputAmount: "100",
      hops: 1, // path of length 2 => 1 hop
    });
    expect(routes[1]).toMatchObject({ outputAmount: "95", hops: 2 });
  });
});

describe("aggregateRoutes", () => {
  it("merges providers and ranks best output first", () => {
    const routes = aggregateRoutes([providerA, providerB]);
    expect(routes).toHaveLength(3);
    expect(routes[0]).toMatchObject({ providerId: "provider-b", outputAmount: "99.5" });
    expect(routes.map((r) => r.outputAmount)).toEqual(["99.5", "98.0", "95"]);
  });

  it("returns an empty list and null best route when there are no routes", () => {
    expect(aggregateRoutes([])).toEqual([]);
    expect(bestRoute([])).toBeNull();
  });

  it("exposes the single best route across providers", () => {
    expect(bestRoute([providerA, providerB])?.providerId).toBe("provider-b");
  });
});
