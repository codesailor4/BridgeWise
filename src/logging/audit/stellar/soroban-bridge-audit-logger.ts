import { randomUUID } from 'crypto';
import {
  AuditEvent,
  AuditEventType,
  AuditSearchQuery,
  AuditLoggerConfig,
} from './soroban-bridge-audit-logger.types';

/**
 * Append-only audit log for Soroban bridge operations.
 *
 * Records are stored in insertion order. A configurable cap evicts the oldest
 * entries when the log grows beyond `maxEvents` so memory stays bounded in
 * long-running processes.
 *
 * Usage:
 *   const logger = new SorobanBridgeAuditLogger();
 *   logger.log('transfer.initiated', { transferId: 'abc123' });
 *   const events = logger.search({ type: 'transfer.initiated', transferId: 'abc123' });
 */
export class SorobanBridgeAuditLogger {
  private readonly events: AuditEvent[] = [];
  private readonly maxEvents: number;
  private readonly now: () => number;
  private readonly idGen: () => string;

  constructor(config: AuditLoggerConfig = {}) {
    this.maxEvents = config.maxEvents ?? 10_000;
    this.now = config.now ?? (() => Date.now());
    this.idGen = config.idGen ?? (() => randomUUID());

    if (this.maxEvents < 1) {
      throw new RangeError('maxEvents must be ≥ 1');
    }
  }

  /**
   * Append a new audit event to the log.
   *
   * When the log is at capacity the oldest entry is removed before the new
   * one is appended.
   *
   * @returns The persisted event (with its generated id and timestamp).
   */
  log(
    type: AuditEventType,
    data: Omit<AuditEvent, 'id' | 'type' | 'timestamp'> = {},
  ): AuditEvent {
    const event: AuditEvent = {
      id: this.idGen(),
      type,
      timestamp: this.now(),
      ...data,
    };

    if (this.events.length >= this.maxEvents) {
      this.events.shift();
    }
    this.events.push(event);
    return event;
  }

  /**
   * Search recorded events by any combination of type, transferId, providerId,
   * and time range.
   *
   * Returns matching events sorted by timestamp ascending (oldest first).
   */
  search(query: AuditSearchQuery): AuditEvent[] {
    return this.events.filter((e) => {
      if (query.type && e.type !== query.type) return false;
      if (query.transferId && e.transferId !== query.transferId) return false;
      if (query.providerId && e.providerId !== query.providerId) return false;
      if (
        query.fromTimestamp !== undefined &&
        e.timestamp < query.fromTimestamp
      )
        return false;
      if (query.toTimestamp !== undefined && e.timestamp > query.toTimestamp)
        return false;
      return true;
    });
  }

  /** Retrieve a single event by its id, or `undefined` if not found. */
  getById(id: string): AuditEvent | undefined {
    return this.events.find((e) => e.id === id);
  }

  /** All recorded events in insertion order. */
  getAll(): AuditEvent[] {
    return [...this.events];
  }

  /** Total number of events currently in the log. */
  get size(): number {
    return this.events.length;
  }

  /** Remove all events from the log. */
  clear(): void {
    this.events.length = 0;
  }
}
