export interface RouteHistoryEntry {
  routeId: string;
  fromAsset: string;
  toAsset: string;
  executedAt: Date;
  durationMs: number;
  success: boolean;
}

const routeHistory: RouteHistoryEntry[] = [];

export function recordRouteExecution(entry: RouteHistoryEntry): void {
  routeHistory.push(entry);
}

export function getRouteHistory(routeId?: string): RouteHistoryEntry[] {
  if (routeId) {
    return routeHistory.filter((e) => e.routeId === routeId);
  }
  return [...routeHistory];
}

export function getRouteHistoryByDateRange(
  from: Date,
  to: Date
): RouteHistoryEntry[] {
  return routeHistory.filter(
    (e) => e.executedAt >= from && e.executedAt <= to
  );
}

export function clearRouteHistory(): void {
  routeHistory.length = 0;
}