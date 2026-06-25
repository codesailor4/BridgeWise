import type {
  SorobanProviderMetadata,
  MetadataUpdate,
  MetadataServiceConfig,
  MetadataQuery,
} from './types';

export class StellarProviderMetadataService {
  private readonly registry = new Map<string, SorobanProviderMetadata>();
  private readonly maxProviders: number;
  private readonly now: () => number;

  constructor(config: MetadataServiceConfig = {}) {
    this.maxProviders = config.maxProviders ?? 100;
    this.now = config.now ?? (() => Date.now());

    if (this.maxProviders < 1) {
      throw new RangeError('maxProviders must be ≥ 1');
    }
  }

  register(metadata: SorobanProviderMetadata): boolean {
    if (this.registry.has(metadata.id)) return false;
    if (this.registry.size >= this.maxProviders) return false;

    const entry: SorobanProviderMetadata = {
      ...metadata,
      createdAt: this.now(),
      updatedAt: this.now(),
    };
    this.registry.set(metadata.id, entry);
    return true;
  }

  update(id: string, update: MetadataUpdate): boolean {
    const existing = this.registry.get(id);
    if (!existing) return false;

    this.registry.set(id, {
      ...existing,
      ...update,
      updatedAt: this.now(),
    });
    return true;
  }

  get(id: string): SorobanProviderMetadata | undefined {
    return this.registry.get(id);
  }

  query(query: MetadataQuery = {}): SorobanProviderMetadata[] {
    let results = [...this.registry.values()];

    if (query.status) {
      results = results.filter((p) => p.status === query.status);
    }
    if (query.network) {
      results = results.filter((p) => p.network === query.network);
    }
    if (query.asset) {
      results = results.filter((p) =>
        p.supportedAssets.includes(query.asset!),
      );
    }

    return results.sort((a, b) => a.createdAt - b.createdAt);
  }

  getAll(): SorobanProviderMetadata[] {
    return [...this.registry.values()].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
  }

  remove(id: string): boolean {
    return this.registry.delete(id);
  }

  get size(): number {
    return this.registry.size;
  }
}
