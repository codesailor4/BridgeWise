import {
  StellarRouteSimulationCache,
  buildSimulationKey,
  type SimulationKeyInput,
} from './stellar-route-simulation-cache';

interface DummyResult {
  destinationAmount: string;
  pathHops: number;
}

const KEY_A: SimulationKeyInput = {
  sourceAsset: 'XLM:native',
  destinationAsset: 'USDC:GA…',
  sourceAmount: '1000000',
  network: 'testnet',
};
const RESULT_A: DummyResult = { destinationAmount: '950000', pathHops: 2 };

const KEY_B: SimulationKeyInput = {
  sourceAsset: 'XLM:native',
  destinationAsset: 'USDC:GA…',
  sourceAmount: '2000000',
  network: 'testnet',
};
const RESULT_B: DummyResult = { destinationAmount: '1899000', pathHops: 2 };

describe('buildSimulationKey', () => {
  it('is deterministic for identical inputs', () => {
    expect(buildSimulationKey(KEY_A)).toBe(buildSimulationKey(KEY_A));
  });

  it('discriminates on every input field', () => {
    const base = buildSimulationKey(KEY_A);
    expect(buildSimulationKey({ ...KEY_A, sourceAmount: '999' })).not.toBe(base);
    expect(buildSimulationKey({ ...KEY_A, network: 'mainnet' })).not.toBe(base);
    expect(buildSimulationKey({ ...KEY_A, sourceAsset: 'XLM:other' })).not.toBe(base);
    expect(buildSimulationKey({ ...KEY_A, destinationAsset: 'EURC:GA…' })).not.toBe(base);
  });
});

describe('StellarRouteSimulationCache', () => {
  let cache: StellarRouteSimulationCache<DummyResult>;

  beforeEach(() => {
    cache = new StellarRouteSimulationCache<DummyResult>({
      maxEntries: 3,
      ttlMs: 1_000,
      cleanupIntervalMs: 60_000,
    });
  });

  afterEach(() => cache.destroy());

  it('stores and retrieves a result', () => {
    cache.set(KEY_A, RESULT_A, 1_000);
    expect(cache.get(KEY_A, 1_000)).toEqual(RESULT_A);
    expect(cache.has(KEY_A, 1_000)).toBe(true);
    expect(cache.size).toBe(1);
  });

  it('returns null on a miss', () => {
    expect(cache.get(KEY_A, 1_000)).toBeNull();
    expect(cache.has(KEY_A, 1_000)).toBe(false);
  });

  it('returns null and prunes the entry once TTL expires', () => {
    cache.set(KEY_A, RESULT_A, 1_000);
    expect(cache.get(KEY_A, 1_900)).toEqual(RESULT_A);
    expect(cache.get(KEY_A, 2_001)).toBeNull();
    expect(cache.size).toBe(0);
  });

  it('evicts the oldest entry when at capacity', () => {
    cache.set({ ...KEY_A, sourceAmount: '1' }, RESULT_A, 1_000);
    cache.set({ ...KEY_A, sourceAmount: '2' }, RESULT_A, 1_001);
    cache.set({ ...KEY_A, sourceAmount: '3' }, RESULT_A, 1_002);
    cache.set({ ...KEY_A, sourceAmount: '4' }, RESULT_A, 1_003);
    expect(cache.size).toBe(3);
    expect(cache.has({ ...KEY_A, sourceAmount: '1' }, 1_003)).toBe(false);
    expect(cache.has({ ...KEY_A, sourceAmount: '4' }, 1_003)).toBe(true);
  });

  it('replacing an existing key does not trigger eviction', () => {
    cache.set({ ...KEY_A, sourceAmount: '1' }, RESULT_A, 1_000);
    cache.set({ ...KEY_A, sourceAmount: '2' }, RESULT_B, 1_001);
    cache.set({ ...KEY_A, sourceAmount: '3' }, RESULT_A, 1_002);
    cache.set({ ...KEY_A, sourceAmount: '2' }, RESULT_A, 1_003); // replace
    expect(cache.size).toBe(3);
    expect(cache.has({ ...KEY_A, sourceAmount: '1' }, 1_003)).toBe(true);
  });

  describe('invalidation', () => {
    beforeEach(() => {
      cache.set(KEY_A, RESULT_A, 1_000);
      cache.set(KEY_B, RESULT_B, 1_001);
      cache.set(
        { sourceAsset: 'XLM:native', destinationAsset: 'EURC:GA…', sourceAmount: '500', network: 'mainnet' },
        { destinationAmount: '49', pathHops: 1 },
        1_002,
      );
    });

    it('invalidate(key) removes only that entry', () => {
      expect(cache.invalidate(KEY_A)).toBe(true);
      expect(cache.size).toBe(2);
      expect(cache.invalidate(KEY_A)).toBe(false);
    });

    it('invalidateNetwork removes every entry on the network', () => {
      const removed = cache.invalidateNetwork('testnet');
      expect(removed).toBe(2);
      expect(cache.size).toBe(1);
    });

    it('invalidateAsset removes entries touching the asset on either side', () => {
      const removed = cache.invalidateAsset('USDC:GA…');
      expect(removed).toBe(2);
      expect(cache.size).toBe(1);
    });

    it('invalidateBy supports arbitrary predicates', () => {
      const removed = cache.invalidateBy((entry) => entry.input.sourceAmount === '1000000');
      expect(removed).toBe(1);
      expect(cache.size).toBe(2);
    });

    it('clear() drops everything', () => {
      cache.clear();
      expect(cache.size).toBe(0);
    });
  });
});
