import { StellarProviderMetadataService } from '../stellar-provider-metadata.service';
import type { SorobanProviderMetadata } from '../types';

describe('StellarProviderMetadataService', () => {
  const baseProvider: SorobanProviderMetadata = {
    id: 'soroswap',
    name: 'SoroSwap',
    endpoint: 'https://soroswap.io',
    network: 'mainnet',
    version: '1.0.0',
    supportedAssets: ['XLM', 'USDC'],
    status: 'active',
    createdAt: 0,
    updatedAt: 0,
  };

  let service: StellarProviderMetadataService;

  beforeEach(() => {
    service = new StellarProviderMetadataService({ now: () => 1000 });
  });

  describe('register', () => {
    it('registers a new provider', () => {
      expect(service.register(baseProvider)).toBe(true);
      expect(service.size).toBe(1);
    });

    it('rejects duplicate provider ids', () => {
      service.register(baseProvider);
      expect(service.register(baseProvider)).toBe(false);
      expect(service.size).toBe(1);
    });

    it('rejects registration when at capacity', () => {
      service = new StellarProviderMetadataService({
        maxProviders: 1,
        now: () => 1000,
      });
      service.register(baseProvider);
      const another = { ...baseProvider, id: 'another' };
      expect(service.register(another)).toBe(false);
    });

    it('sets createdAt and updatedAt from the clock', () => {
      service.register(baseProvider);
      const stored = service.get('soroswap');
      expect(stored?.createdAt).toBe(1000);
      expect(stored?.updatedAt).toBe(1000);
    });
  });

  describe('update', () => {
    it('updates provider metadata fields', () => {
      service.register(baseProvider);
      expect(service.update('soroswap', { version: '2.0.0' })).toBe(true);
      const stored = service.get('soroswap');
      expect(stored?.version).toBe('2.0.0');
      expect(stored?.name).toBe('SoroSwap');
    });

    it('refreshes updatedAt on update', () => {
      service.register(baseProvider);
      service.update('soroswap', { status: 'inactive' });
      expect(service.get('soroswap')?.updatedAt).toBe(1000);
    });

    it('returns false for unknown provider', () => {
      expect(service.update('unknown', { name: 'test' })).toBe(false);
    });

    it('partially updates only provided fields', () => {
      service.register(baseProvider);
      service.update('soroswap', { endpoint: 'https://new.soroswap.io' });
      const stored = service.get('soroswap');
      expect(stored?.endpoint).toBe('https://new.soroswap.io');
      expect(stored?.network).toBe('mainnet');
      expect(stored?.version).toBe('1.0.0');
    });
  });

  describe('get / getAll', () => {
    it('returns undefined for unknown provider', () => {
      expect(service.get('unknown')).toBeUndefined();
    });

    it('returns registered provider by id', () => {
      service.register(baseProvider);
      expect(service.get('soroswap')).toMatchObject({
        id: 'soroswap',
        name: 'SoroSwap',
      });
    });

    it('getAll returns all registered providers sorted by creation time', () => {
      service.register(baseProvider);
      service.register({ ...baseProvider, id: 'aquarius', name: 'Aquarius' });
      const all = service.getAll();
      expect(all).toHaveLength(2);
      expect(all[0].id).toBe('soroswap');
    });
  });

  describe('query', () => {
    it('filters by status', () => {
      service.register(baseProvider);
      service.register({
        ...baseProvider,
        id: 'aquarius',
        status: 'inactive',
      });
      const active = service.query({ status: 'active' });
      expect(active).toHaveLength(1);
      expect(active[0].id).toBe('soroswap');
    });

    it('filters by network', () => {
      service.register(baseProvider);
      service.register({
        ...baseProvider,
        id: 'testnet-provider',
        network: 'testnet',
      });
      const results = service.query({ network: 'testnet' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('testnet-provider');
    });

    it('filters by supported asset', () => {
      service.register(baseProvider);
      service.register({
        ...baseProvider,
        id: 'eth-provider',
        supportedAssets: ['ETH', 'BTC'],
      });
      const results = service.query({ asset: 'ETH' });
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe('eth-provider');
    });

    it('returns all providers when no filters are applied', () => {
      service.register(baseProvider);
      service.register({ ...baseProvider, id: 'provider2' });
      expect(service.query()).toHaveLength(2);
    });
  });

  describe('remove', () => {
    it('removes a provider by id', () => {
      service.register(baseProvider);
      expect(service.remove('soroswap')).toBe(true);
      expect(service.size).toBe(0);
    });

    it('returns false for unknown provider', () => {
      expect(service.remove('unknown')).toBe(false);
    });
  });

  describe('constructor validation', () => {
    it('throws when maxProviders is less than 1', () => {
      expect(
        () => new StellarProviderMetadataService({ maxProviders: 0 }),
      ).toThrow(RangeError);
    });
  });
});
