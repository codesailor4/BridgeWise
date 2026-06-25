export interface SorobanProviderMetadata {
  id: string;
  name: string;
  endpoint: string;
  network: string;
  version: string;
  supportedAssets: string[];
  status: 'active' | 'inactive' | 'deprecated';
  createdAt: number;
  updatedAt: number;
}

export interface MetadataUpdate {
  name?: string;
  endpoint?: string;
  network?: string;
  version?: string;
  supportedAssets?: string[];
  status?: 'active' | 'inactive' | 'deprecated';
}

export interface MetadataServiceConfig {
  maxProviders?: number;
  now?: () => number;
}

export interface MetadataQuery {
  status?: 'active' | 'inactive' | 'deprecated';
  network?: string;
  asset?: string;
}
