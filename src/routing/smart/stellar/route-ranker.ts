import {
  RankedRoute,
  RouteRankingConfig,
  RouteRankingResult,
  RouteRankingWeights,
} from './ranking-types';
import { Route } from './soroban-smart-routing-engine';

const DEFAULT_WEIGHTS: RouteRankingWeights = {
  feeCost: 0.5,
  duration: 0.5,
};

/**
 * Normalizes an array of numeric values to the [0, 1] range using min-max scaling.
 * Returns 0 for all values if min === max (no variance).
 */
function minMaxNormalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return values.map(() => 0);
  return values.map((v) => (v - min) / (max - min));
}

/**
 * Resolves and validates weights, ensuring they sum to 1.
 * If the provided weights do not sum to 1, they are normalized proportionally.
 */
function resolveWeights(
  partial?: Partial<RouteRankingWeights>
): RouteRankingWeights {
  const merged: RouteRankingWeights = {
    ...DEFAULT_WEIGHTS,
    ...partial,
  };

  const total = merged.feeCost + merged.duration;
  if (Math.abs(total - 1) > 1e-6) {
    // Normalize to sum to 1
    return {
      feeCost: merged.feeCost / total,
      duration: merged.duration / total,
    };
  }

  return merged;
}

/**
 * Ranks an array of Soroban bridge routes by a composite cost+speed score.
 *
 * Scoring uses min-max normalized values weighted by the provided config.
 * A lower score is better (0 = best possible on both dimensions).
 *
 * @example
 * // Prefer cheapest routes (80% fee weight)
 * const result = rankSorobanRoutes(routes, { weights: { feeCost: 0.8, duration: 0.2 } });
 * console.log(result.best?.route);
 *
 * @example
 * // Default 50/50 weighting, return only top 3
 * const result = rankSorobanRoutes(routes, { topN: 3 });
 */
export function rankSorobanRoutes(
  routes: Route[],
  config: RouteRankingConfig = {}
): RouteRankingResult {
  const weights = resolveWeights(config.weights);
  const topN = config.topN ?? routes.length;

  if (routes.length === 0) {
    return {
      ranked: [],
      best: null,
      config: { weights, topN },
    };
  }

  // Extract raw fee and duration values from routes.
  // Route.fee is assumed to be in stroops (or smallest unit); Route.estimatedTime in ms.
  const fees = routes.map((r) => Number(r ?? 0));
  const durations = routes.map((r) => Number(r.estimatedTimeMs ?? 0));

  const normalizedFees = minMaxNormalize(fees);
  const normalizedDurations = minMaxNormalize(durations);

  const scored: RankedRoute[] = routes.map((route, i) => {
    const normalizedFee = normalizedFees[i];
    const normalizedDuration = normalizedDurations[i];
    const weightedScore =
      weights.feeCost * normalizedFee + weights.duration * normalizedDuration;

    return {
      route,
      score: weightedScore,
      rank: 0, // assigned below after sorting
      breakdown: {
        normalizedFee,
        normalizedDuration,
        weightedScore,
      },
    };
  });

  // Sort ascending by score (lower = better)
  scored.sort((a, b) => a.score - b.score);

  // Assign ranks (1-based)
  scored.forEach((r, i) => {
    r.rank = i + 1;
  });

  const ranked = scored.slice(0, topN);

  return {
    ranked,
    best: ranked[0] ?? null,
    config: { weights, topN },
  };
}

/**
 * Returns only the top N routes, convenience wrapper around rankSorobanRoutes.
 */
export function getTopSorobanRoutes(
  routes: Route[],
  n: number,
  config: Omit<RouteRankingConfig, 'topN'> = {}
): RankedRoute[] {
  return rankSorobanRoutes(routes, { ...config, topN: n }).ranked;
}