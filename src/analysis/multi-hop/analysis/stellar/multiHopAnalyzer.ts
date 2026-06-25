import {
  MultiHopRoute,
  RouteAnalysis,
} from "./types";

export class StellarMultiHopAnalyzer {
  analyze(route: MultiHopRoute): RouteAnalysis {
    const totalCost = route.hops.reduce(
      (sum, hop) => sum + hop.cost,
      0
    );

    const totalLatency = route.hops.reduce(
      (sum, hop) => sum + hop.latency,
      0
    );

    return {
      routeId: route.routeId,
      hopCount: route.hops.length,
      totalCost,
      totalLatency,
    };
  }

  analyzeRoutes(
    routes: MultiHopRoute[]
  ): RouteAnalysis[] {
    return routes.map((route) =>
      this.analyze(route)
    );
  }

  detectRouteHops(route: MultiHopRoute): number {
    return route.hops.length;
  }
}