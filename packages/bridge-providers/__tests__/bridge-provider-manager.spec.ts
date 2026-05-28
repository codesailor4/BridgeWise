import { BridgeProviderManager, ProviderMetrics, BridgeProvider, BridgeParams } from '../index';

describe('BridgeProviderManager', () => {
  let manager: BridgeProviderManager;
  const makeProvider = (name: string, available = true): BridgeProvider => ({
    name,
    getRoutes: async () => [],
    isAvailable: () => available,
    getSupportedChains: () => ['stellar'],
    getSupportedTokens: () => ['USDC'],
  });

  beforeEach(() => {
    manager = BridgeProviderManager.getInstance();
    manager.unregisterProvider('stellar-a');
    manager.unregisterProvider('stellar-b');
    manager.unregisterProvider('stellar-c');
  });

  it('computes provider priority from reliability, availability, latency, and failure metrics', () => {
    manager.registerProvider(makeProvider('stellar-a'));
    manager.registerProvider(makeProvider('stellar-b'));

    manager.updateProviderMetrics('stellar-a', {
      reliability: 0.97,
      availability: 0.98,
      latencyMs: 120,
      failureRate: 0.02,
    });

    manager.updateProviderMetrics('stellar-b', {
      reliability: 0.80,
      availability: 0.85,
      latencyMs: 450,
      failureRate: 0.08,
    });

    const priorityA = manager.getProviderPriority('stellar-a');
    const priorityB = manager.getProviderPriority('stellar-b');

    expect(priorityA).toBeGreaterThan(priorityB);
    expect(priorityA).toBeGreaterThan(0.5);
    expect(priorityB).toBeLessThan(0.8);
  });

  it('orders providers by dynamic priority and drops unavailable providers when collecting routes', async () => {
    const availableProvider = makeProvider('stellar-a', true);
    const unavailableProvider = makeProvider('stellar-b', false);

    manager.registerProvider(availableProvider);
    manager.registerProvider(unavailableProvider);

    manager.updateProviderMetrics('stellar-a', {
      reliability: 0.99,
      availability: 0.99,
      latencyMs: 100,
      failureRate: 0.01,
    });

    manager.updateProviderMetrics('stellar-b', {
      reliability: 0.95,
      availability: 0.96,
      latencyMs: 200,
      failureRate: 0.04,
    });

    const providersByPriority = manager.getProvidersByPriority();

    expect(providersByPriority[0].provider.name).toBe('stellar-a');
    expect(providersByPriority.some((entry) => entry.provider.name === 'stellar-b')).toBe(true);

    const routes = await manager.getAllRoutes({
      fromChain: 'stellar',
      toChain: 'ethereum',
      fromToken: 'USDC',
      toToken: 'ETH',
      amount: '1000',
    });

    expect(routes).toEqual([]);
  });

  it('returns default neutral priority when metrics are missing', () => {
    manager.registerProvider(makeProvider('stellar-a'));
    expect(manager.getProviderPriority('stellar-a')).toBe(0.5);
  });
});
