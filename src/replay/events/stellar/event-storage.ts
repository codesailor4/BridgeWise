/**
 * In-Memory Event Storage Backend
 * Efficient storage and querying of bridge events
 */

import type {
  EventStorageBackend,
  StoredBridgeEvent,
  ReplayFilterCriteria,
  EventQueryResult,
  InMemoryEventStorageConfig,
  ReplayableEventType,
} from './types';

const DEFAULT_CONFIG: Required<InMemoryEventStorageConfig> = {
  maxEvents: 100_000,
  ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
  autoCleanup: true,
  cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
  enableIndexing: true,
};

/**
 * In-memory event storage with efficient querying and indexing
 */
export class InMemoryEventStorage implements EventStorageBackend {
  private events = new Map<string, StoredBridgeEvent>();
  private config: Required<InMemoryEventStorageConfig>;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  // Indexes for faster queries
  private indexes = {
    byType: new Map<ReplayableEventType, Set<string>>(),
    byContract: new Map<string, Set<string>>(),
    byFromAddress: new Map<string, Set<string>>(),
    byToAddress: new Map<string, Set<string>>(),
    byTransactionHash: new Map<string, Set<string>>(),
    bySourceAccount: new Map<string, Set<string>>(),
    creationTimes: new Map<string, number>(),
  };

  constructor(config: InMemoryEventStorageConfig = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    if (this.config.autoCleanup) {
      this.startCleanup();
    }
  }

  /**
   * Store a single event
   */
  async store(event: StoredBridgeEvent): Promise<void> {
    if (this.events.size >= this.config.maxEvents) {
      this.evictOldest();
    }

    this.events.set(event.id, event);
    this.updateIndexes(event, true);
  }

  /**
   * Store multiple events
   */
  async storeMultiple(events: StoredBridgeEvent[]): Promise<void> {
    for (const event of events) {
      await this.store(event);
    }
  }

  /**
   * Query events with filters
   */
  async query(filter: ReplayFilterCriteria): Promise<EventQueryResult> {
    let results = this.filterEvents(filter);

    // Apply pagination
    const offset = filter.offset || 0;
    const limit = filter.limit || 1000;
    const total = results.length;
    const hasMore = offset + limit < total;

    const events = results.slice(offset, offset + limit);

    return {
      events,
      total,
      limit,
      offset,
      hasMore,
    };
  }

  /**
   * Get a single event by ID
   */
  async get(eventId: string): Promise<StoredBridgeEvent | null> {
    return this.events.get(eventId) || null;
  }

  /**
   * Get events by transaction hash
   */
  async getByTransactionHash(hash: string): Promise<StoredBridgeEvent[]> {
    const eventIds = this.indexes.byTransactionHash.get(hash) || new Set();
    return Array.from(eventIds)
      .map((id) => this.events.get(id))
      .filter((event): event is StoredBridgeEvent => !!event);
  }

  /**
   * Delete a single event
   */
  async delete(eventId: string): Promise<boolean> {
    const event = this.events.get(eventId);
    if (!event) {
      return false;
    }

    this.updateIndexes(event, false);
    this.events.delete(eventId);
    return true;
  }

  /**
   * Delete events in a time range
   */
  async deleteRange(startTime: Date, endTime: Date): Promise<number> {
    const startMs = startTime.getTime();
    const endMs = endTime.getTime();
    let deleted = 0;

    for (const [id, event] of this.events.entries()) {
      const eventTime = event.timestamp.getTime();
      if (eventTime >= startMs && eventTime <= endMs) {
        this.updateIndexes(event, false);
        this.events.delete(id);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Count events matching filter
   */
  async count(filter?: ReplayFilterCriteria): Promise<number> {
    if (!filter) {
      return this.events.size;
    }
    return this.filterEvents(filter).length;
  }

  /**
   * Get total storage size in bytes
   */
  async getStorageSize(): Promise<number> {
    let size = 0;
    for (const event of this.events.values()) {
      size += JSON.stringify(event).length;
    }
    return size;
  }

  /**
   * Cleanup storage
   */
  async cleanup(): Promise<void> {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.events.clear();
    this.clearIndexes();
  }

  /**
   * Private helper methods
   */

  private filterEvents(filter: ReplayFilterCriteria): StoredBridgeEvent[] {
    let results = Array.from(this.events.values());

    // Time-based filtering
    if (filter.startTime) {
      const startMs = filter.startTime.getTime();
      results = results.filter((e) => e.timestamp.getTime() >= startMs);
    }
    if (filter.endTime) {
      const endMs = filter.endTime.getTime();
      results = results.filter((e) => e.timestamp.getTime() <= endMs);
    }

    // Event type filtering
    if (filter.eventTypes && filter.eventTypes.length > 0) {
      const types = new Set(filter.eventTypes);
      results = results.filter((e) => types.has(e.type));
    }

    // Address filtering
    if (filter.fromAddress) {
      results = results.filter((e) => 'from' in e && e.from === filter.fromAddress);
    }
    if (filter.toAddress) {
      results = results.filter((e) => 'to' in e && e.to === filter.toAddress);
    }
    if (filter.addresses && filter.addresses.length > 0) {
      const addresses = new Set(filter.addresses);
      results = results.filter(
        (e) =>
          ('from' in e && addresses.has(e.from || '')) ||
          ('to' in e && addresses.has(e.to || '')),
      );
    }

    // Contract filtering
    if (filter.contractId) {
      results = results.filter((e) => e.contractId === filter.contractId);
    }
    if (filter.contractIds && filter.contractIds.length > 0) {
      const contracts = new Set(filter.contractIds);
      results = results.filter((e) => e.contractId && contracts.has(e.contractId));
    }

    // Transaction filtering
    if (filter.transactionHash) {
      results = results.filter((e) => e.transactionHash === filter.transactionHash);
    }
    if (filter.sequenceNumber !== undefined) {
      results = results.filter((e) => e.sequenceNumber === filter.sequenceNumber);
    }
    if (filter.ledgerSequence !== undefined) {
      results = results.filter((e) => e.ledgerSequence === filter.ledgerSequence);
    }
    if (filter.sourceAccount) {
      results = results.filter((e) => e.sourceAccount === filter.sourceAccount);
    }

    // Amount filtering
    if (filter.minAmount || filter.maxAmount) {
      results = results.filter((e) => {
        if (!('amount' in e) || !e.amount) return false;
        const amount = BigInt(e.amount || '0');
        if (filter.minAmount && amount < BigInt(filter.minAmount)) return false;
        if (filter.maxAmount && amount > BigInt(filter.maxAmount)) return false;
        return true;
      });
    }

    // Asset filtering
    if (filter.asset) {
      results = results.filter((e) => 'asset' in e && e.asset === filter.asset);
    }
    if (filter.assets && filter.assets.length > 0) {
      const assets = new Set(filter.assets);
      results = results.filter((e) => 'asset' in e && e.asset && assets.has(e.asset));
    }

    // Metadata filtering
    if (filter.hasMetadata) {
      results = results.filter((e) => e.metadata && Object.keys(e.metadata).length > 0);
    }
    if (filter.metadataMatches) {
      results = results.filter((e) => this.matchesMetadata(e.metadata || {}, filter.metadataMatches));
    }

    // Custom predicate
    if (filter.predicate) {
      results = results.filter(filter.predicate);
    }

    // Sort by timestamp (newest first)
    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return results;
  }

  private matchesMetadata(metadata: Record<string, any>, pattern: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(pattern)) {
      if (typeof value === 'object' && value !== null) {
        if (!this.matchesMetadata(metadata[key] || {}, value)) {
          return false;
        }
      } else if (metadata[key] !== value) {
        return false;
      }
    }
    return true;
  }

  private updateIndexes(event: StoredBridgeEvent, add: boolean): void {
    if (!this.config.enableIndexing) return;

    const operation = add ? 'add' : 'delete';

    // Index by type
    this.updateIndex(this.indexes.byType, event.type, event.id, operation);

    // Index by contract
    if (event.contractId) {
      this.updateIndex(this.indexes.byContract, event.contractId, event.id, operation);
    }

    // Index by addresses (for normalized events)
    if ('from' in event && event.from) {
      this.updateIndex(this.indexes.byFromAddress, event.from, event.id, operation);
    }
    if ('to' in event && event.to) {
      this.updateIndex(this.indexes.byToAddress, event.to, event.id, operation);
    }

    // Index by transaction hash
    if (event.transactionHash) {
      this.updateIndex(this.indexes.byTransactionHash, event.transactionHash, event.id, operation);
    }

    // Index by source account
    if (event.sourceAccount) {
      this.updateIndex(this.indexes.bySourceAccount, event.sourceAccount, event.id, operation);
    }

    // Track creation time
    if (add) {
      this.indexes.creationTimes.set(event.id, event.timestamp.getTime());
    } else {
      this.indexes.creationTimes.delete(event.id);
    }
  }

  private updateIndex(
    index: Map<string, Set<string>>,
    key: string,
    eventId: string,
    operation: 'add' | 'delete',
  ): void {
    if (operation === 'add') {
      if (!index.has(key)) {
        index.set(key, new Set());
      }
      index.get(key)!.add(eventId);
    } else {
      const set = index.get(key);
      if (set) {
        set.delete(eventId);
        if (set.size === 0) {
          index.delete(key);
        }
      }
    }
  }

  private clearIndexes(): void {
    this.indexes.byType.clear();
    this.indexes.byContract.clear();
    this.indexes.byFromAddress.clear();
    this.indexes.byToAddress.clear();
    this.indexes.byTransactionHash.clear();
    this.indexes.bySourceAccount.clear();
    this.indexes.creationTimes.clear();
  }

  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;

    for (const [id, time] of this.indexes.creationTimes.entries()) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestId = id;
      }
    }

    if (oldestId) {
      const event = this.events.get(oldestId);
      if (event) {
        this.updateIndexes(event, false);
        this.events.delete(oldestId);
      }
    }
  }

  private startCleanup(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      const cutoff = now - this.config.ttl;

      for (const [id, time] of this.indexes.creationTimes.entries()) {
        if (time < cutoff) {
          const event = this.events.get(id);
          if (event) {
            this.updateIndexes(event, false);
            this.events.delete(id);
          }
        }
      }
    }, this.config.cleanupInterval);
  }
}
