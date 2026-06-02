export type StellarRouteSample = {
  routeId: string;
  latencyMs: number;
  at: number;
};

export type StellarRouteCongestion = {
  routeId: string;
  averageLatencyMs: number;
  spike: boolean;
};

export function analyzeStellarRouteCongestion(
  samples: StellarRouteSample[],
  spikeMultiplier = 1.6
): StellarRouteCongestion[] {
  const grouped = new Map<string, number[]>();
  for (const s of samples) {
    const bucket = grouped.get(s.routeId) ?? [];
    bucket.push(s.latencyMs);
    grouped.set(s.routeId, bucket);
  }

  const out: StellarRouteCongestion[] = [];
  for (const [routeId, latencies] of grouped.entries()) {
    const avg = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const max = Math.max(...latencies);
    out.push({
      routeId,
      averageLatencyMs: Math.round(avg),
      spike: max > avg * spikeMultiplier,
    });
  }
  return out;
}
