/**
 * Soroban Event Replay Processor Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SorobanEventReplayProcessor } from '../soroban-event-replay-processor';
import { InMemoryEventStorage } from '../event-storage';
import { createReplayQuery, ReplayQueryPresets } from '../query-builder';
import type {
  StoredRawBridgeEvent,
  StoredNormalizedBridgeEvent,
  ReplayFilterCriteria,
} from '../types';

describe('Soroban Event Replay Processor', () => {
  let processor: SorobanEventReplayProcessor;
  let testEvents: StoredRawBridgeEvent[];

  beforeEach(() => {
    processor = new SorobanEventReplayProcessor({ verbose: false });
    testEvents = createTestEvents();
  });

  afterEach(() => {
    processor.removeAllListeners();
  });

  describe('Event Storage', () => {
    it('should store a single event', async () => {
      const event = testEvents[0];
      await processor.storeEvent(event);

      const result = await processor.queryEvents({ limit: 10 });
      expect(result.events).toContainEqual(expect.objectContaining({ id: event.id }));
    });

    it('should store multiple events', async () => {
      await processor.storeEvents(testEvents);

      const result = await processor.queryEvents({ limit: 100 });
      expect(result.events.length).toBe(testEvents.length);
      expect(result.total).toBe(testEvents.length);
    });

    it('should retrieve stored events', async () => {
      await processor.storeEvents(testEvents);

      const event = testEvents[0];
      const result = await processor.queryEvents({ transactionHash: event.transactionHash });

      expect(result.events.length).toBeGreaterThan(0);
    });

    it('should emit event-stored event', async () => {
      const eventListener = vi.fn();
      processor.on('event-stored', eventListener);

      await processor.storeEvent(testEvents[0]);

      expect(eventListener).toHaveBeenCalled();
    });
  });

  describe('Event Querying', () => {
    beforeEach(async () => {
      await processor.storeEvents(testEvents);
    });

    it('should query by time range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const result = await processor.queryEvents({
        startTime: yesterday,
        endTime: now,
      });

      expect(result.events.length).toBeGreaterThan(0);
    });

    it('should query by event type', async () => {
      const result = await processor.queryEvents({ eventTypes: ['transfer'] });
      expect(result.events.every((e) => e.type === 'transfer')).toBe(true);
    });

    it('should query by contract ID', async () => {
      const contractId = testEvents[0].contractId;
      const result = await processor.queryEvents({ contractId });

      expect(result.events.length).toBeGreaterThan(0);
      expect(result.events.every((e) => e.contractId === contractId)).toBe(true);
    });

    it('should query by address', async () => {
      const result = await processor.queryEvents({
        addresses: ['GBUQWP3BOUZX34ULNQG23RQ6F4PFXKEC6FMBLIOTXHLHAPXVUJP3ORCZ'],
      });

      expect(result.events.length).toBeGreaterThan(0);
    });

    it('should support pagination', async () => {
      const result1 = await processor.queryEvents({ limit: 2, offset: 0 });
      const result2 = await processor.queryEvents({ limit: 2, offset: 2 });

      expect(result1.events.length).toBe(2);
      expect(result2.events.length).toBeGreaterThanOrEqual(0);
      expect(result1.hasMore || result2.events.length > 0).toBe(true);
    });

    it('should filter by custom predicate', async () => {
      const result = await processor.queryEvents({
        predicate: (event) => event.type === 'transfer',
      });

      expect(result.events.every((e) => e.type === 'transfer')).toBe(true);
    });
  });

  describe('Event Replay', () => {
    beforeEach(async () => {
      await processor.storeEvents(testEvents);
    });

    it('should replay events to registered listeners', async () => {
      const listener = vi.fn();
      processor.registerListener(listener);

      const result = await processor.startReplay({ eventTypes: ['transfer'] }, { mode: 'fast' });

      expect(listener).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.statistics.replayedEvents).toBeGreaterThan(0);
    });

    it('should support fast mode replay', async () => {
      const listener = vi.fn();
      processor.registerListener(listener);

      const startTime = Date.now();
      const result = await processor.startReplay({}, { mode: 'fast', dryRun: false });
      const durationMs = Date.now() - startTime;

      expect(result.statistics.durationMs).toBeLessThan(5000);
      expect(listener).toHaveBeenCalled();
    });

    it('should support throttled mode replay', async () => {
      const listener = vi.fn();
      processor.registerListener(listener);

      const startTime = Date.now();
      await processor.startReplay({ limit: 3 }, { mode: 'throttled', delayMs: 100 });
      const durationMs = Date.now() - startTime;

      expect(durationMs).toBeGreaterThanOrEqual(200); // At least 2 delays
      expect(listener).toHaveBeenCalled();
    });

    it('should support dry-run mode', async () => {
      const listener = vi.fn();
      processor.registerListener(listener);

      const result = await processor.startReplay({}, { mode: 'fast', dryRun: true });

      expect(listener).not.toHaveBeenCalled();
      expect(result.statistics.replayedEvents).toBeGreaterThan(0); // Still counts
    });

    it('should handle errors gracefully', async () => {
      let errorCount = 0;
      processor.registerListener(() => {
        if (errorCount++ === 1) {
          throw new Error('Test error');
        }
      });

      const result = await processor.startReplay({}, { continueOnError: true });

      expect(result.statistics.failedEvents).toBeGreaterThan(0);
    });

    it('should stop on error when continueOnError is false', async () => {
      let callCount = 0;
      processor.registerListener(() => {
        callCount++;
        if (callCount === 2) {
          throw new Error('Test error');
        }
      });

      const result = await processor.startReplay({}, { continueOnError: false });

      expect(result.success).toBe(false);
      expect(callCount).toBe(2);
    });

    it('should track replay progress', async () => {
      let lastProgress = 0;
      processor.on('replay-progress', ({ progress }) => {
        expect(progress).toBeGreaterThanOrEqual(lastProgress);
        lastProgress = progress;
      });

      await processor.startReplay({}, { mode: 'fast' });

      expect(lastProgress).toBe(100);
    });

    it('should return replay statistics', async () => {
      const listener = vi.fn();
      processor.registerListener(listener);

      const result = await processor.startReplay({}, { mode: 'fast' });

      expect(result.statistics).toHaveProperty('sessionId');
      expect(result.statistics).toHaveProperty('totalEvents');
      expect(result.statistics).toHaveProperty('replayedEvents');
      expect(result.statistics).toHaveProperty('failureCount');
      expect(result.statistics).toHaveProperty('durationMs');
      expect(result.statistics).toHaveProperty('eventsPerSecond');
    });
  });

  describe('Replay Sessions', () => {
    it('should manage active sessions', async () => {
      await processor.storeEvents(testEvents);

      const activeBefore = processor.getActiveSessions();
      const result = await processor.startReplay({});
      const activeAfter = processor.getActiveSessions();

      expect(activeAfter.length).toBeLessThanOrEqual(activeBefore.length);
      expect(result.sessionId).toBeDefined();
    });

    it('should retrieve session history', async () => {
      await processor.storeEvents(testEvents);

      const result1 = await processor.startReplay({});
      const history = processor.getSessionHistory(result1.sessionId);

      expect(history).toBeDefined();
      expect(history?.sessionId).toBe(result1.sessionId);
    });

    it('should emit replay-started event', async () => {
      await processor.storeEvents(testEvents);

      const listener = vi.fn();
      processor.on('replay-started', listener);

      await processor.startReplay({});

      expect(listener).toHaveBeenCalled();
    });

    it('should emit replay-completed event', async () => {
      await processor.storeEvents(testEvents);

      const listener = vi.fn();
      processor.on('replay-completed', listener);

      await processor.startReplay({});

      expect(listener).toHaveBeenCalled();
    });
  });

  describe('Query Builder', () => {
    beforeEach(async () => {
      await processor.storeEvents(testEvents);
    });

    it('should build query with time range', async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

      const query = createReplayQuery().between(yesterday, now).build();
      const result = await processor.queryEvents(query);

      expect(result.events.length).toBeGreaterThan(0);
    });

    it('should build query with types', async () => {
      const query = createReplayQuery().ofTypes('transfer', 'mint').build();
      const result = await processor.queryEvents(query);

      expect(result.events.every((e) => e.type === 'transfer' || e.type === 'mint')).toBe(true);
    });

    it('should build query with pagination', async () => {
      const query = createReplayQuery().limit(5).offset(0).build();
      const result = await processor.queryEvents(query);

      expect(result.events.length).toBeLessThanOrEqual(5);
    });

    it('should chain methods', async () => {
      const query = createReplayQuery()
        .ofType('transfer')
        .lastDays(1)
        .limit(10)
        .build();

      const result = await processor.queryEvents(query);

      expect(result.events.length).toBeGreaterThanOrEqual(0);
    });

    it('should use query presets', async () => {
      const query = ReplayQueryPresets.transfers().build();
      const result = await processor.queryEvents(query);

      expect(result.events.every((e) => e.type === 'transfer')).toBe(true);
    });
  });

  describe('Storage Stats', () => {
    it('should retrieve storage statistics', async () => {
      await processor.storeEvents(testEvents);

      const stats = await processor.getStorageStats();

      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('eventsByType');
      expect(stats).toHaveProperty('eventsByContract');
      expect(stats).toHaveProperty('storageSize');
    });

    it('should track events by type', async () => {
      await processor.storeEvents(testEvents);

      const stats = await processor.getStorageStats();

      expect(stats.eventsByType['transfer']).toBeGreaterThan(0);
    });

    it('should track events by contract', async () => {
      await processor.storeEvents(testEvents);

      const stats = await processor.getStorageStats();

      expect(Object.keys(stats.eventsByContract).length).toBeGreaterThan(0);
    });
  });

  describe('Listener Management', () => {
    it('should register and unregister listeners', async () => {
      const listener = vi.fn();
      const unregister = processor.registerListener(listener);

      await processor.storeEvents(testEvents);
      await processor.startReplay({}, { mode: 'fast' });

      expect(listener).toHaveBeenCalled();

      unregister();

      listener.mockClear();
      await processor.startReplay({}, { mode: 'fast' });

      expect(listener).not.toHaveBeenCalled();
    });

    it('should support multiple listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      processor.registerListener(listener1);
      processor.registerListener(listener2);

      await processor.storeEvents(testEvents);
      await processor.startReplay({}, { mode: 'fast' });

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it('should support error listeners', async () => {
      const errorListener = vi.fn();
      processor.registerErrorListener(errorListener);

      processor.registerListener(() => {
        throw new Error('Test error');
      });

      await processor.storeEvents(testEvents.slice(0, 2));
      await processor.startReplay({}, { continueOnError: true });

      expect(errorListener).toHaveBeenCalled();
    });
  });
});

/**
 * Helper: Create test events
 */
function createTestEvents(): StoredRawBridgeEvent[] {
  const now = Date.now();
  const contractId = 'CADSCVF4MFXTV2HFYGDYXFCL3IUJG5LPNWGZYHXU6QTHGDQBGIXW5KQ';

  return [
    {
      id: 'evt-1',
      timestamp: new Date(now - 3600000),
      source: 'test-bridge',
      type: 'transfer',
      payload: { amount: '1000000000' },
      contractId,
      transactionHash: 'txn-1',
      sequenceNumber: 100,
      ledgerSequence: 50000,
      sourceAccount: 'GBUQWP3BOUZX34ULNQG23RQ6F4PFXKEC6FMBLIOTXHLHAPXVUJP3ORCZ',
    },
    {
      id: 'evt-2',
      timestamp: new Date(now - 1800000),
      source: 'test-bridge',
      type: 'transfer',
      payload: { amount: '2000000000' },
      contractId,
      transactionHash: 'txn-2',
      sequenceNumber: 101,
      ledgerSequence: 50001,
      sourceAccount: 'GBUQWP3BOUZX34ULNQG23RQ6F4PFXKEC6FMBLIOTXHLHAPXVUJP3ORCZ',
    },
    {
      id: 'evt-3',
      timestamp: new Date(now - 900000),
      source: 'test-bridge',
      type: 'mint',
      payload: { amount: '500000000' },
      contractId,
      transactionHash: 'txn-3',
      sequenceNumber: 102,
      ledgerSequence: 50002,
      sourceAccount: 'GBUQWP3BOUZX34ULNQG23RQ6F4PFXKEC6FMBLIOTXHLHAPXVUJP3ORCZ',
    },
    {
      id: 'evt-4',
      timestamp: new Date(now),
      source: 'test-bridge',
      type: 'transfer',
      payload: { amount: '3000000000' },
      contractId,
      transactionHash: 'txn-4',
      sequenceNumber: 103,
      ledgerSequence: 50003,
      sourceAccount: 'GBUQWP3BOUZX34ULNQG23RQ6F4PFXKEC6FMBLIOTXHLHAPXVUJP3ORCZ',
    },
  ];
}
