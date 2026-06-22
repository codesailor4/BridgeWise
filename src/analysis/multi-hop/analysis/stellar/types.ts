export interface RouteHop {
  source: string;
  destination: string;
  cost: number;
  latency: number;
}

export interface MultiHopRoute {
  routeId: string;
  hops: RouteHop[];
}

export interface RouteAnalysis {
  routeId: string;
  hopCount: number;
  totalCost: number;
  totalLatency: number;
}