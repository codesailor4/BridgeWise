import { StellarMultiHopAnalyzer } from "./multiHopAnalyzer";

describe("StellarMultiHopAnalyzer", () => {
  const analyzer = new StellarMultiHopAnalyzer();

  it("detects route hops", () => {
    const hops = analyzer.detectRouteHops({
      routeId: "route-1",
      hops: [
        {
          source: "XLM",
          destination: "USDC",
          cost: 1,
          latency: 2,
        },
        {
          source: "USDC",
          destination: "EURC",
          cost: 2,
          latency: 3,
        },
      ],
    });

    expect(hops).toBe(2);
  });

  it("analyzes cumulative cost and latency", () => {
    const result = analyzer.analyze({
      routeId: "route-1",
      hops: [
        {
          source: "XLM",
          destination: "USDC",
          cost: 1,
          latency: 2,
        },
        {
          source: "USDC",
          destination: "EURC",
          cost: 2,
          latency: 3,
        },
      ],
    });

    expect(result.totalCost).toBe(3);
    expect(result.totalLatency).toBe(5);
    expect(result.hopCount).toBe(2);
  });
});