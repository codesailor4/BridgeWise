import { StellarProviderDiscoveryService } from './stellar-provider-discovery.service';
import { StellarProviderMetadata } from './stellar-provider-discovery.types';

const makeProvider = (
  id: string,
  status: StellarProviderMetadata['status'] = 'active',
): Omit<StellarProviderMetadata, 'registeredAt'> => ({
  id,
  name: `Provider ${id}`,
  endpoint: `https://${id}.example.com`,
  status,
  supportedAssets: ['XLM'],
});

describe('StellarProviderDiscoveryService', () => {
  let service: StellarProviderDiscoveryService;
  let tick: number;

  beforeEach(() => {
    tick = 1_000;
    service = new StellarProviderDiscoveryService({ now: () => tick });
  });

  // ─── Constructor ──────────────────────────────────────────────────────────

  it('throws when maxProviders < 1', () => {
    expect(() => new StellarProviderDiscoveryService({ maxProviders: 0 })).toThrow(RangeError);
  });

  // ─── discover ─────────────────────────────────────────────────────────────

  it('registers new providers returned by fetchFn', async () => {
    const result = await service.discover(async () => [makeProvider('p1'), makeProvider('p2')]);

    expect(result).toEqual({ discovered: 2, registered: 2, skipped: 0 });
    expect(service.size).toBe(2);
  });

  it('skips duplicate providers across multiple discoveries', async () => {
    await service.discover(async () => [makeProvider('p1')]);
    const result = await service.discover(async () => [makeProvider('p1'), makeProvider('p2')]);

    expect(result).toEqual({ discovered: 2, registered: 1, skipped: 1 });
    expect(service.size).toBe(2);
  });

  it('skips providers when registry is at capacity', async () => {
    const s = new StellarProviderDiscoveryService({ maxProviders: 2, now: () => tick });
    await s.discover(async () => [makeProvider('p1'), makeProvider('p2'), makeProvider('p3')]);

    expect(s.size).toBe(2);
  });

  // ─── register ─────────────────────────────────────────────────────────────

  it('registers a single provider and stamps registeredAt', () => {
    tick = 5_000;
    const ok = service.register(makeProvider('p1'));

    expect(ok).toBe(true);
    expect(service.get('p1')?.registeredAt).toBe(5_000);
  });

  it('returns false for duplicate registration', () => {
    service.register(makeProvider('p1'));
    expect(service.register(makeProvider('p1'))).toBe(false);
  });

  it('returns false when registry is at capacity', () => {
    const s = new StellarProviderDiscoveryService({ maxProviders: 1, now: () => tick });
    s.register(makeProvider('p1'));
    expect(s.register(makeProvider('p2'))).toBe(false);
  });

  // ─── deregister ───────────────────────────────────────────────────────────

  it('removes a registered provider', () => {
    service.register(makeProvider('p1'));
    expect(service.deregister('p1')).toBe(true);
    expect(service.get('p1')).toBeUndefined();
  });

  it('returns false when deregistering unknown provider', () => {
    expect(service.deregister('ghost')).toBe(false);
  });

  // ─── getByStatus ──────────────────────────────────────────────────────────

  it('filters providers by status', () => {
    service.register(makeProvider('p1', 'active'));
    service.register(makeProvider('p2', 'inactive'));
    service.register(makeProvider('p3', 'active'));

    const active = service.getByStatus('active');
    expect(active.map((p) => p.id)).toEqual(['p1', 'p3']);
  });

  // ─── updateStatus ─────────────────────────────────────────────────────────

  it('updates a provider status', () => {
    service.register(makeProvider('p1', 'active'));
    expect(service.updateStatus('p1', 'degraded')).toBe(true);
    expect(service.get('p1')?.status).toBe('degraded');
  });

  it('returns false when updating unknown provider', () => {
    expect(service.updateStatus('ghost', 'inactive')).toBe(false);
  });

  // ─── getAll ordering ──────────────────────────────────────────────────────

  it('returns providers sorted by registration time', () => {
    let t = 0;
    const s = new StellarProviderDiscoveryService({ now: () => ++t });
    s.register(makeProvider('p1'));
    s.register(makeProvider('p2'));
    s.register(makeProvider('p3'));

    expect(s.getAll().map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
  });
});
