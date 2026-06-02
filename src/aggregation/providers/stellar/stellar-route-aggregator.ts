/**
 * Multi-provider route aggregation for Stellar bridge transfers.
 *
 * Different providers report routes with slightly different field names and
 * types. This engine normalises each provider response into a common shape,
 * merges them, and ranks the combined set so routing can pick the best option
 * across all providers instead of being limited to one.
 */

export interface NormalizedRoute {
  providerId: string;
  sourceAsset: string;
  destAsset: string;
  inputAmount: string;
  outputAmount: string;
  feeAmount: string;
  hops: number;
  estimatedSeconds?: number;
}

export interface RawProviderResponse {
  providerId: string;
  sourceAsset: string;
  destAsset: string;
  /** Provider-specific raw route objects. */
  routes: Array<Record<string, unknown>>;
}

function firstDefined(obj: Record<string, unknown>, keys: string[]): unknown {
  for (const key of keys) {
    if (obj[key] !== undefined && obj[key] !== null) return obj[key];
  }
  return undefined;
}

function toAmountString(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))) {
    return value.trim();
  }
  return null;
}

/**
 * Normalise a single provider's response into common-shaped routes. Routes that
 * lack a usable output amount are treated as malformed and dropped.
 */
export function normalizeProviderResponse(response: RawProviderResponse): NormalizedRoute[] {
  const normalized: NormalizedRoute[] = [];
  for (const raw of response.routes) {
    const output = toAmountString(firstDefined(raw, ["outputAmount", "amountOut", "estimatedReceive"]));
    if (output === null) continue; // malformed: no usable output amount

    const input = toAmountString(firstDefined(raw, ["inputAmount", "amountIn"])) ?? "0";
    const fee = toAmountString(firstDefined(raw, ["feeAmount", "fee"])) ?? "0";
    const rawHops = firstDefined(raw, ["hops"]);
    const path = raw["path"];
    const hops =
      typeof rawHops === "number"
        ? rawHops
        : Array.isArray(path)
          ? Math.max(path.length - 1, 1)
          : 1;
    const estimated = firstDefined(raw, ["estimatedSeconds", "etaSeconds"]);

    normalized.push({
      providerId: response.providerId,
      sourceAsset: response.sourceAsset,
      destAsset: response.destAsset,
      inputAmount: input,
      outputAmount: output,
      feeAmount: fee,
      hops,
      estimatedSeconds: typeof estimated === "number" ? estimated : undefined,
    });
  }
  return normalized;
}

/**
 * Aggregate routes across providers, best-first: higher output wins, ties broken
 * by lower fee then fewer hops. Deterministic for a given input.
 */
export function aggregateRoutes(responses: RawProviderResponse[]): NormalizedRoute[] {
  const all = responses.flatMap(normalizeProviderResponse);
  return all.sort((a, b) => {
    const outDiff = Number(b.outputAmount) - Number(a.outputAmount);
    if (outDiff !== 0) return outDiff;
    const feeDiff = Number(a.feeAmount) - Number(b.feeAmount);
    if (feeDiff !== 0) return feeDiff;
    return a.hops - b.hops;
  });
}

/** Convenience: the single best route across all providers, or null if none. */
export function bestRoute(responses: RawProviderResponse[]): NormalizedRoute | null {
  return aggregateRoutes(responses)[0] ?? null;
}
