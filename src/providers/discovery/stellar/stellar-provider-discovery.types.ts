export type ProviderStatus = 'active' | 'inactive' | 'degraded';

export interface StellarProviderMetadata {
  id: string;
  name: string;
  endpoint: string;
  status: ProviderStatus;
  supportedAssets: string[];
  registeredAt: number;
}

export interface DiscoveryConfig {
  /** Maximum number of providers allowed in the registry. Default 100. */
  maxProviders?: number;
  /** Injected clock for deterministic testing. Defaults to Date.now. */
  now?: () => number;
}

export interface DiscoveryResult {
  discovered: number;
  registered: number;
  skipped: number;
}
