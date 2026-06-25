import { LatencyPrediction, RouteLatencyRecord } from './latency-predictor.types';

const MIN_SAMPLES_FOR_HIGH_CONFIDENCE = 10;
const MIN_SAMPLES_FOR_MEDIUM_CONFIDENCE = 3;

const history: RouteLatencyRecord[] = [];

export function recordLatency(record: RouteLatencyRecord): void {
  history.push(record);
}

export function predictLatency(routeId: string): LatencyPrediction | null {
  const records = history.filter(r => r.routeId === routeId && r.success);

  if (records.length === 0) {
    return null;
  }

  const durations = records.map(r => r.durationMs);
  const mean = durations.reduce((a, b) => a + b, 0) / durations.length;

  // Weight recent records more heavily (exponential moving average)
  const ema = durations.reduce((acc, val, i) => {
    const alpha = 2 / (durations.length + 1);
    return i === 0 ? val : acc * (1 - alpha) + val * alpha;
  }, 0);

  const estimatedMs = Math.round((mean * 0.4 + ema * 0.6));

  const confidence = records.length >= MIN_SAMPLES_FOR_HIGH_CONFIDENCE
    ? 0.9
    : records.length >= MIN_SAMPLES_FOR_MEDIUM_CONFIDENCE
    ? 0.6
    : 0.3;

  return {
    routeId,
    estimatedMs,
    confidence,
    sampleCount: records.length,
    predictedAt: new Date(),
  };
}

export function clearHistory(): void {
  history.length = 0;
}
