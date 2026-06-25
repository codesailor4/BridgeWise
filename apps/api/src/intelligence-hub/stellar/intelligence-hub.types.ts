export interface RouteIntelligence {
  routeId: string;
  sourceChain: string;
  destinationChain: string;
  supportedAssets: string[];
  providerName: string;
  avgFeeUsd: number;
  avgTimeSeconds: number;
  reliabilityScore: number;
  liquidityUsd: number;
  lastUpdatedAt: Date;
}

export interface ProviderIntelligence {
  name: string;
  type: 'stellar' | 'evm';
  supportedRoutes: number;
  supportedAssets: string[];
  avgReliabilityScore: number;
  totalLiquidityUsd: number;
  avgFeeUsd: number;
  avgTimeSeconds: number;
}

export interface AssetIntelligence {
  symbol: string;
  name: string;
  supportedChains: string[];
  supportedProviders: string[];
  totalLiquidityUsd: number;
  avgSlippagePercent: number;
  transferCount: number;
}

export interface IntelligenceSearchResult {
  type: 'route' | 'provider' | 'asset';
  score: number;
  data: RouteIntelligence | ProviderIntelligence | AssetIntelligence;
}

export interface IntelligenceHubSnapshot {
  generatedAt: Date;
  routes: RouteIntelligence[];
  providers: ProviderIntelligence[];
  assets: AssetIntelligence[];
  totalRoutes: number;
  totalProviders: number;
  totalAssets: number;
}
