import {
  StellarProviderMetadata,
  DiscoveryConfig,
  DiscoveryResult,
  ProviderStatus,
} from './stellar-provider-discovery.types';

/**
 * Discovers and registers Stellar bridge providers dynamically.
 *
 * Providers are sourced from a configurable metadata fetch function and stored
 * in an in-memory registry keyed by provider id. Duplicate registrations
 * (same id) are silently skipped to keep the registry idempotent.
 *
 * Usage:
 *   const service = new StellarProviderDiscoveryService({ maxProviders: 50 });
 *   const result = await service.discover(fetchProviderList);
 *   const active = service.getByStatus('active');
 */
export class StellarProviderDiscoveryService {
  private readonly registry = new Map<string, StellarProviderMetadata>();
  private readonly maxProviders: number;
  private readonly now: () => number;

  constructor(config: DiscoveryConfig = {}) {
    this.maxProviders = config.maxProviders ?? 100;
    this.now = config.now ?? (() => Date.now());

    if (this.maxProviders < 1) {
      throw new RangeError('maxProviders must be ≥ 1');
    }
  }

  /**
   * Fetch provider metadata from the supplied async function, then register
   * all previously-unknown providers up to `maxProviders`.
   *
   * @param fetchFn  Async function that resolves to an array of raw provider
   *                 metadata (sans `registeredAt`).
   */
  async discover(
    fetchFn: () => Promise<Omit<StellarProviderMetadata, 'registeredAt'>[]>,
  ): Promise<DiscoveryResult> {
    const raw = await fetchFn();
    let registered = 0;
    let skipped = 0;

    for (const item of raw) {
      if (this.registry.has(item.id)) {
        skipped++;
        continue;
      }
      if (this.registry.size >= this.maxProviders) {
        skipped++;
        continue;
      }
      this.registry.set(item.id, { ...item, registeredAt: this.now() });
      registered++;
    }

    return { discovered: raw.length, registered, skipped };
  }

  /**
   * Register a single provider directly without going through discovery.
   *
   * Returns `false` when the provider is already registered or the registry
   * is at capacity.
   */
  register(provider: Omit<StellarProviderMetadata, 'registeredAt'>): boolean {
    if (this.registry.has(provider.id)) return false;
    if (this.registry.size >= this.maxProviders) return false;

    this.registry.set(provider.id, { ...provider, registeredAt: this.now() });
    return true;
  }

  /** Remove a provider from the registry. Returns `true` if it was present. */
  deregister(id: string): boolean {
    return this.registry.delete(id);
  }

  /** Look up a provider by id. */
  get(id: string): StellarProviderMetadata | undefined {
    return this.registry.get(id);
  }

  /** All registered providers, sorted by registration time ascending. */
  getAll(): StellarProviderMetadata[] {
    return [...this.registry.values()].sort(
      (a, b) => a.registeredAt - b.registeredAt,
    );
  }

  /** All registered providers matching a given status. */
  getByStatus(status: ProviderStatus): StellarProviderMetadata[] {
    return this.getAll().filter((p) => p.status === status);
  }

  /** Update the status of a registered provider. Returns `false` if not found. */
  updateStatus(id: string, status: ProviderStatus): boolean {
    const provider = this.registry.get(id);
    if (!provider) return false;
    provider.status = status;
    return true;
  }

  /** Number of currently registered providers. */
  get size(): number {
    return this.registry.size;
  }
}
