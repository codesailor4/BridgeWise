import { BridgeRoute, RankedRoute, routeRanker } from '../../src/services/route-ranker';

export interface BridgeProvider {
  name: string;
  getRoutes(params: BridgeParams): Promise<BridgeRoute[]>;
  isAvailable(): boolean;
  getSupportedChains(): string[];
  getSupportedTokens(): string[];
}

export interface ProviderMetrics {
  reliability?: number; // 0-1
  availability?: number; // 0-1
  latencyMs?: number;
  failureRate?: number; // 0-1
}

export interface ProviderPriorityConfig {
  reliabilityWeight?: number;
  availabilityWeight?: number;
  latencyWeight?: number;
  failureWeight?: number;
}

export interface BridgeParams {
  fromChain: string;
  toChain: string;
  fromToken: string;
  toToken: string;
  amount: string;
  userAddress?: string;
  slippage?: number;
}

export class BridgeProviderManager {
  private static instance: BridgeProviderManager;
  private providers: Map<string, BridgeProvider> = new Map();
  private providerMetrics: Map<string, ProviderMetrics> = new Map();
  private providerPriorityConfig: Required<ProviderPriorityConfig> = {
    reliabilityWeight: 0.4,
    availabilityWeight: 0.3,
    latencyWeight: 0.2,
    failureWeight: 0.1,
  };

  private constructor() {}

  static getInstance(): BridgeProviderManager {
    if (!BridgeProviderManager.instance) {
      BridgeProviderManager.instance = new BridgeProviderManager();
    }
    return BridgeProviderManager.instance;
  }

  /**
   * Register a bridge provider
   */
  registerProvider(provider: BridgeProvider) {
    this.providers.set(provider.name, provider);
  }

  /**
   * Update priority metrics for a provider
   */
  updateProviderMetrics(providerName: string, metrics: ProviderMetrics) {
    if (!this.providers.has(providerName)) {
      throw new Error(`Provider ${providerName} not found`);
    }

    this.providerMetrics.set(providerName, {
      ...this.providerMetrics.get(providerName),
      ...metrics,
    });
  }

  /**
   * Get the current computed priority for a provider
   */
  getProviderPriority(providerName: string): number {
    const metrics = this.providerMetrics.get(providerName);
    if (!metrics) {
      return 0.5;
    }

    const reliabilityScore = this.toScore(metrics.reliability, false);
    const availabilityScore = this.toScore(metrics.availability, false);
    const latencyScore = this.toScore(metrics.latencyMs, true);
    const failureScore = this.toScore(metrics.failureRate, true);

    const totalWeight =
      this.providerPriorityConfig.reliabilityWeight +
      this.providerPriorityConfig.availabilityWeight +
      this.providerPriorityConfig.latencyWeight +
      this.providerPriorityConfig.failureWeight;

    return (
      reliabilityScore * this.providerPriorityConfig.reliabilityWeight +
      availabilityScore * this.providerPriorityConfig.availabilityWeight +
      latencyScore * this.providerPriorityConfig.latencyWeight +
      failureScore * this.providerPriorityConfig.failureWeight
    ) / totalWeight;
  }

  /**
   * Get a list of providers ordered by their current priority.
   */
  getProvidersByPriority() {
    return Array.from(this.providers.values())
      .map((provider) => ({
        provider,
        priority: this.getProviderPriority(provider.name),
      }))
      .sort((left, right) => right.priority - left.priority);
  }

  /**
   * Normalize a single priority metric to a 0-1 score.
   */
  private toScore(value: number | undefined, lowerIsBetter: boolean): number {
    if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
      return 0.5;
    }

    const normalizedValue = lowerIsBetter
      ? value <= 1
        ? Math.min(1, Math.max(0, value))
        : Math.min(1, Math.max(0, value / 1000))
      : Math.min(1, Math.max(0, value));

    if (!lowerIsBetter) {
      return normalizedValue;
    }

    return 1 - normalizedValue;
  }

  /**
   * Unregister a bridge provider
   */
  unregisterProvider(name: string) {
    this.providers.delete(name);
    this.providerMetrics.delete(name);
  }

  /**
   * Get all available routes from all providers
   */
  async getAllRoutes(params: BridgeParams): Promise<BridgeRoute[]> {
    const availableProviders = this.getProvidersByPriority()
      .map((entry) => entry.provider)
      .filter((provider) => provider.isAvailable());

    const routePromises = availableProviders.map((provider) =>
      provider.getRoutes(params).catch((error) => {
        console.error(`Provider ${provider.name} failed:`, error);
        return [] as BridgeRoute[];
      }),
    );

    const allRoutes = await Promise.all(routePromises);
    return allRoutes.flat();
  }

  /**
   * Get ranked routes from all providers
   */
  async getRankedRoutes(
    params: BridgeParams, 
    criteria?: import('../../src/services/route-ranker').RankingCriteria
  ): Promise<RankedRoute[]> {
    const allRoutes = await this.getAllRoutes(params);
    const rankedRoutes = routeRanker.rankRoutes(allRoutes, criteria);

    return rankedRoutes.sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return this.getProviderPriority(b.provider) - this.getProviderPriority(a.provider);
    });
  }

  /**
   * Get best route from all providers
   */
  async getBestRoute(
    params: BridgeParams,
    criteria?: import('../../src/services/route-ranker').RankingCriteria
  ): Promise<RankedRoute | null> {
    const rankedRoutes = await this.getRankedRoutes(params, criteria);
    return rankedRoutes.length > 0 ? rankedRoutes[0] : null;
  }

  /**
   * Get routes from specific provider
   */
  async getProviderRoutes(
    providerName: string,
    params: BridgeParams
  ): Promise<BridgeRoute[]> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Provider ${providerName} not found`);
    }
    if (!provider.isAvailable()) {
      throw new Error(`Provider ${providerName} is not available`);
    }
    return provider.getRoutes(params);
  }

  /**
   * Get all supported chains across providers
   */
  getSupportedChains(): string[] {
    const chains = new Set<string>();
    for (const provider of this.providers.values()) {
      provider.getSupportedChains().forEach(chain => chains.add(chain));
    }
    return Array.from(chains);
  }

  /**
   * Get all supported tokens across providers
   */
  getSupportedTokens(): string[] {
    const tokens = new Set<string>();
    for (const provider of this.providers.values()) {
      provider.getSupportedTokens().forEach(token => tokens.add(token));
    }
    return Array.from(tokens);
  }

  /**
   * Get provider statistics
   */
  getProviderStats(): {
    totalProviders: number;
    availableProviders: number;
    providers: Array<{
      name: string;
      available: boolean;
      supportedChains: number;
      supportedTokens: number;
      priority: number;
    }>;
  } {
    const providers = Array.from(this.providers.values()).map((provider) => ({
      name: provider.name,
      available: provider.isAvailable(),
      supportedChains: provider.getSupportedChains().length,
      supportedTokens: provider.getSupportedTokens().length,
      priority: this.getProviderPriority(provider.name),
    }));

    return {
      totalProviders: providers.length,
      availableProviders: providers.filter((p) => p.available).length,
      providers,
    };
  }
}

// Example provider implementation
export class ExampleBridgeProvider implements BridgeProvider {
  name = 'ExampleBridge';
  
  async getRoutes(params: BridgeParams): Promise<BridgeRoute[]> {
    // This would make actual API calls to the bridge provider
    // For now, return mock data
    return [
      {
        id: `${this.name}-1`,
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount,
        fee: {
          amount: '0.001',
          token: 'ETH',
          usdValue: 2.5,
        },
        estimatedTime: 15,
        successRate: 0.95,
        provider: this.name,
        gasEstimate: {
          amount: '0.005',
          token: 'ETH',
          usdValue: 12.5,
        },
        slippage: 0.5,
        confidence: 0.9,
      },
      {
        id: `${this.name}-2`,
        fromChain: params.fromChain,
        toChain: params.toChain,
        fromToken: params.fromToken,
        toToken: params.toToken,
        amount: params.amount,
        fee: {
          amount: '0.002',
          token: 'ETH',
          usdValue: 5.0,
        },
        estimatedTime: 8,
        successRate: 0.92,
        provider: this.name,
        gasEstimate: {
          amount: '0.008',
          token: 'ETH',
          usdValue: 20.0,
        },
        slippage: 0.3,
        confidence: 0.85,
      },
    ];
  }

  isAvailable(): boolean {
    return true; // Check if provider is online/maintained
  }

  getSupportedChains(): string[] {
    return ['ethereum', 'polygon', 'arbitrum', 'optimism', 'base'];
  }

  getSupportedTokens(): string[] {
    return ['ETH', 'USDC', 'USDT', 'DAI'];
  }
}

// Export singleton instance
export const bridgeProviderManager = BridgeProviderManager.getInstance();
