import { SorobanBridgeAuditLogger } from './soroban-bridge-audit-logger';

describe('SorobanBridgeAuditLogger', () => {
  let counter: number;
  let tick: number;
  let logger: SorobanBridgeAuditLogger;

  beforeEach(() => {
    counter = 0;
    tick = 1_000;
    logger = new SorobanBridgeAuditLogger({
      now: () => tick,
      idGen: () => `evt-${++counter}`,
    });
  });

  // ─── Constructor ──────────────────────────────────────────────────────────

  it('throws when maxEvents < 1', () => {
    expect(() => new SorobanBridgeAuditLogger({ maxEvents: 0 })).toThrow(RangeError);
  });

  // ─── log ──────────────────────────────────────────────────────────────────

  it('appends an event and returns it with generated id and timestamp', () => {
    tick = 2_000;
    const event = logger.log('transfer.initiated', { transferId: 'tx1' });

    expect(event.id).toBe('evt-1');
    expect(event.type).toBe('transfer.initiated');
    expect(event.transferId).toBe('tx1');
    expect(event.timestamp).toBe(2_000);
    expect(logger.size).toBe(1);
  });

  it('evicts the oldest event when at capacity', () => {
    const small = new SorobanBridgeAuditLogger({
      maxEvents: 2,
      now: () => tick,
      idGen: () => `evt-${++counter}`,
    });

    small.log('transfer.initiated', { transferId: 'tx1' });
    small.log('transfer.submitted', { transferId: 'tx2' });
    small.log('transfer.confirmed', { transferId: 'tx3' });

    expect(small.size).toBe(2);
    expect(small.getAll()[0].transferId).toBe('tx2');
  });

  // ─── search ───────────────────────────────────────────────────────────────

  it('returns all events when query is empty', () => {
    logger.log('transfer.initiated');
    logger.log('transfer.failed');

    expect(logger.search({})).toHaveLength(2);
  });

  it('filters by type', () => {
    logger.log('transfer.initiated');
    logger.log('transfer.failed');

    expect(logger.search({ type: 'transfer.initiated' })).toHaveLength(1);
  });

  it('filters by transferId', () => {
    logger.log('transfer.initiated', { transferId: 'tx1' });
    logger.log('transfer.initiated', { transferId: 'tx2' });

    const results = logger.search({ transferId: 'tx1' });
    expect(results).toHaveLength(1);
    expect(results[0].transferId).toBe('tx1');
  });

  it('filters by providerId', () => {
    logger.log('provider.registered', { providerId: 'provA' });
    logger.log('provider.registered', { providerId: 'provB' });

    expect(logger.search({ providerId: 'provA' })).toHaveLength(1);
  });

  it('filters by fromTimestamp', () => {
    tick = 500;
    logger.log('transfer.initiated');
    tick = 1_500;
    logger.log('transfer.submitted');

    expect(logger.search({ fromTimestamp: 1_000 })).toHaveLength(1);
  });

  it('filters by toTimestamp', () => {
    tick = 500;
    logger.log('transfer.initiated');
    tick = 1_500;
    logger.log('transfer.submitted');

    expect(logger.search({ toTimestamp: 1_000 })).toHaveLength(1);
  });

  it('combines multiple query fields', () => {
    tick = 1_000;
    logger.log('transfer.initiated', { transferId: 'tx1' });
    tick = 2_000;
    logger.log('transfer.failed', { transferId: 'tx1' });
    tick = 3_000;
    logger.log('transfer.failed', { transferId: 'tx2' });

    const results = logger.search({ type: 'transfer.failed', transferId: 'tx1' });
    expect(results).toHaveLength(1);
    expect(results[0].timestamp).toBe(2_000);
  });

  // ─── getById ──────────────────────────────────────────────────────────────

  it('retrieves an event by id', () => {
    const event = logger.log('transfer.confirmed', { transferId: 'tx1' });
    expect(logger.getById(event.id)).toEqual(event);
  });

  it('returns undefined for unknown id', () => {
    expect(logger.getById('ghost')).toBeUndefined();
  });

  // ─── clear ────────────────────────────────────────────────────────────────

  it('removes all events on clear', () => {
    logger.log('transfer.initiated');
    logger.log('transfer.confirmed');
    logger.clear();

    expect(logger.size).toBe(0);
    expect(logger.getAll()).toHaveLength(0);
  });
});
