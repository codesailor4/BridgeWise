import { Injectable, Logger } from '@nestjs/common';
import {
  RouteIntelligence,
  ProviderIntelligence,
  AssetIntelligence,
  IntelligenceSearchResult,
  IntelligenceHubSnapshot,
} from './intelligence-hub.types';

@Injectable()
export class IntelligenceHubService {
  private readonly logger = new Logger(IntelligenceHubService.name);

  private readonly routes: RouteIntelligence[] = [
    {
      routeId: 'stellar-xlm-usdc-ethereum',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      supportedAssets: ['XLM', 'USDC'],
      providerName: 'StellarBridge',
      avgFeeUsd: 0.01,
      avgTimeSeconds: 5,
      reliabilityScore: 97,
      liquidityUsd: 5_000_000,
      lastUpdatedAt: new Date(),
    },
    {
      routeId: 'stellar-usdc-polygon',
      sourceChain: 'stellar',
      destinationChain: 'polygon',
      supportedAssets: ['USDC'],
      providerName: 'StellarBridge',
      avgFeeUsd: 0.008,
      avgTimeSeconds: 5,
      reliabilityScore: 95,
      liquidityUsd: 2_000_000,
      lastUpdatedAt: new Date(),
    },
    {
      routeId: 'stellar-yxlm-ethereum',
      sourceChain: 'stellar',
      destinationChain: 'ethereum',
      supportedAssets: ['yXLM'],
      providerName: 'StellarBridge',
      avgFeeUsd: 0.012,
      avgTimeSeconds: 6,
      reliabilityScore: 93,
      liquidityUsd: 1_200_000,
      lastUpdatedAt: new Date(),
    },
  ];

  private readonly providers: ProviderIntelligence[] = [
    {
      name: 'StellarBridge',
      type: 'stellar',
      supportedRoutes: 3,
      supportedAssets: ['XLM', 'USDC', 'yXLM'],
      avgReliabilityScore: 95,
      totalLiquidityUsd: 8_200_000,
      avgFeeUsd: 0.01,
      avgTimeSeconds: 5,
    },
  ];

  private readonly assets: AssetIntelligence[] = [
    {
      symbol: 'XLM',
      name: 'Stellar Lumens',
      supportedChains: ['stellar', 'ethereum'],
      supportedProviders: ['StellarBridge'],
      totalLiquidityUsd: 5_000_000,
      avgSlippagePercent: 0.05,
      transferCount: 12_450,
    },
    {
      symbol: 'USDC',
      name: 'USD Coin',
      supportedChains: ['stellar', 'ethereum', 'polygon'],
      supportedProviders: ['StellarBridge'],
      totalLiquidityUsd: 2_000_000,
      avgSlippagePercent: 0.02,
      transferCount: 28_300,
    },
    {
      symbol: 'yXLM',
      name: 'Yield XLM',
      supportedChains: ['stellar', 'ethereum'],
      supportedProviders: ['StellarBridge'],
      totalLiquidityUsd: 1_200_000,
      avgSlippagePercent: 0.08,
      transferCount: 3_100,
    },
  ];

  aggregateRouteIntelligence(): RouteIntelligence[] {
    this.logger.log('Aggregating route intelligence');
    return this.routes;
  }

  aggregateProviderIntelligence(): ProviderIntelligence[] {
    this.logger.log('Aggregating provider intelligence');
    return this.providers;
  }

  aggregateAssetIntelligence(): AssetIntelligence[] {
    this.logger.log('Aggregating asset intelligence');
    return this.assets;
  }

  getSnapshot(): IntelligenceHubSnapshot {
    return {
      generatedAt: new Date(),
      routes: this.routes,
      providers: this.providers,
      assets: this.assets,
      totalRoutes: this.routes.length,
      totalProviders: this.providers.length,
      totalAssets: this.assets.length,
    };
  }

  search(query: string): IntelligenceSearchResult[] {
    const q = query.toLowerCase();
    const results: IntelligenceSearchResult[] = [];

    for (const route of this.routes) {
      const text = `${route.routeId} ${route.sourceChain} ${route.destinationChain} ${route.supportedAssets.join(' ')} ${route.providerName}`.toLowerCase();
      if (text.includes(q)) {
        results.push({ type: 'route', score: this.matchScore(text, q), data: route });
      }
    }

    for (const provider of this.providers) {
      const text = `${provider.name} ${provider.type} ${provider.supportedAssets.join(' ')}`.toLowerCase();
      if (text.includes(q)) {
        results.push({ type: 'provider', score: this.matchScore(text, q), data: provider });
      }
    }

    for (const asset of this.assets) {
      const text = `${asset.symbol} ${asset.name} ${asset.supportedChains.join(' ')} ${asset.supportedProviders.join(' ')}`.toLowerCase();
      if (text.includes(q)) {
        results.push({ type: 'asset', score: this.matchScore(text, q), data: asset });
      }
    }

    return results.sort((a, b) => b.score - a.score);
  }

  private matchScore(text: string, query: string): number {
    const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = (text.match(new RegExp(escaped, 'g')) || []).length;
    const wordCount = text.split(' ').length;
    return wordCount > 0 ? matches / wordCount : 0;
  }
}
