import { Route } from "./soroban-smart-routing-engine";

export interface RouteRankingWeights {
  /**
   * Weight for fee cost (0–1). Higher = penalize expensive routes more.
   * @default 0.5
   */
  feeCost: number;
  /**
   * Weight for estimated duration (0–1). Higher = penalize slower routes more.
   * @default 0.5
   */
  duration: number;
}

export interface RankedRoute {
  route: Route;
  /** Composite score — lower is better */
  score: number;
  rank: number;
  breakdown: {
    normalizedFee: number;
    normalizedDuration: number;
    weightedScore: number;
  };
}

export interface RouteRankingConfig {
  weights?: Partial<RouteRankingWeights>;
  /** Maximum number of routes to return. Defaults to all. */
  topN?: number;
}

export interface RouteRankingResult {
  ranked: RankedRoute[];
  best: RankedRoute | null;
  config: Required<RouteRankingConfig> & { weights: RouteRankingWeights };
}