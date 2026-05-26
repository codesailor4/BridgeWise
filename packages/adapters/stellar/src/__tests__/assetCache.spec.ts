import { AssetCache, AssetMetadata } from '../cache/assets/stellar/assetCache';

describe('AssetCache', () => {
  let cache: AssetCache;

  beforeEach(() => {
    cache = new AssetCache(1); // 1 second TTL for testing
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should store and retrieve asset metadata', () => {
    const asset: AssetMetadata = {
      id: 'test-asset',
      code: 'TST',
      isNative: false,
      decimals: 6,
    };

    cache.set('test-asset', asset);
    const retrieved = cache.get('test-asset');

    expect(retrieved).toEqual(asset);
  });

  it('should return null for non-existent asset', () => {
    const result = cache.get('non-existent');
    expect(result).toBeNull();
  });

  it('should expire assets after TTL', () => {
    const asset: AssetMetadata = {
      id: 'expiring-asset',
      code: 'EXP',
      isNative: false,
      decimals: 6,
    };

    cache.set('expiring-asset', asset);
    
    // Should be available immediately
    let result = cache.get('expiring-asset');
    expect(result).toEqual(asset);

    // Fast-forward time past TTL
    jest.advanceTimersByTime(1500); // 1.5 seconds > 1 second TTL
    
    // Should be null after expiration
    result = cache.get('expiring-asset');
    expect(result).toBeNull();
  });

  it('should invalidate specific assets', () => {
    const asset: AssetMetadata = {
      id: 'to-be-invalidated',
      code: 'TBI',
      isNative: false,
      decimals: 6,
    };

    cache.set('to-be-invalidated', asset);
    expect(cache.get('to-be-invalidated')).toEqual(asset);

    cache.invalidate('to-be-invalidated');
    expect(cache.get('to-be-invalidated')).toBeNull();
  });

  it('should clear all assets with invalidateAll', () => {
    const asset1: AssetMetadata = {
      id: 'asset-1',
      code: 'A1',
      isNative: false,
      decimals: 6,
    };

    const asset2: AssetMetadata = {
      id: 'asset-2',
      code: 'A2',
      isNative: false,
      decimals: 6,
    };

    cache.set('asset-1', asset1);
    cache.set('asset-2', asset2);

    expect(cache.size()).toBe(2);
    cache.invalidateAll();
    expect(cache.size()).toBe(0);
  });

  it('should handle native asset correctly', () => {
    const nativeAsset: AssetMetadata = {
      id: 'native',
      code: 'XLM',
      isNative: true,
      decimals: 7,
    };

    cache.set('native', nativeAsset);
    const retrieved = cache.get('native');
    
    expect(retrieved).toEqual(nativeAsset);
    expect(retrieved?.isNative).toBe(true);
  });
});