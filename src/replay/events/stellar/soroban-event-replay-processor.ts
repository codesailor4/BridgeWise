/**
 * Soroban Event Replay Processor
 * Manages event storage and replay for debugging and analytics
 */

import { EventEmitter } from 'events';
import { randomUUID } from 'crypto';
import type {
  EventStorageBackend,
  StoredBridgeEvent,
  StoredRawBridgeEvent,
  StoredNormalizedBridgeEvent,
  ReplayFilterCriteria,
  ReplayOptions,
  ReplaySession,
  ReplayResult,
  ReplayStatistics,
  ReplayError,
  EventReplayListener,
  EventReplayErrorListener,
  SorobanEventReplayProcessorConfig,
  EventAggregationStats,
} from './types';
import { InMemoryEventStorage } from './event-storage';

const DEFAULT_CONFIG: Required<SorobanEventReplayProcessorConfig> = {
  storageBackend: new InMemoryEventStorage(),
  inMemoryStorage: {},
  defaultReplayOptions: {
    mode: 'fast',
    delayMs: 0,
    continueOnError: true,
    preserveTimestamps: true,
    normalize: false,
    dryRun: false,
  },
  eventRetentionMs: 30 * 24 * 60 * 60 * 1000, // 30 days
  cleanupIntervalMs: 24 * 60 * 60 * 1000, // 24 hours
  maxConcurrentReplays: 5,
  verbose: false,
  onError: console.error,
  onSessionCompleted: undefined,
};

/**
 * Main Soroban Event Replay Processor
 */
export class SorobanEventReplayProcessor extends EventEmitter {
  private config: Required<SorobanEventReplayProcessorConfig>;
  private storage: EventStorageBackend;
  private listeners = new Set<EventReplayListener>();
  private errorListeners = new Set<EventReplayErrorListener>();
  private activeSessions = new Map<string, ReplaySession>();
  private sessionHistory = new Map<string, ReplayResult>();
  private concurrentReplays = 0;
  private replayQueue: Array<() => Promise<void>> = [];

  constructor(config: SorobanEventReplayProcessorConfig = {}) {
    super();
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      inMemoryStorage: {
        ...DEFAULT_CONFIG.inMemoryStorage,
        ...config.inMemoryStorage,
      },
      defaultReplayOptions: {
        ...DEFAULT_CONFIG.defaultReplayOptions,
        ...config.defaultReplayOptions,
      },
    };

    // Use provided backend or create in-memory storage
    this.storage = config.storageBackend || new InMemoryEventStorage(this.config.inMemoryStorage);
  }

  /**
   * Store a single event
   */
  async storeEvent(event: StoredBridgeEvent): Promise<void> {
    try {
      await this.storage.store(event);
      this.emit('event-stored', event);
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Store multiple events
   */
  async storeEvents(events: StoredBridgeEvent[]): Promise<void> {
    try {
      await this.storage.storeMultiple(events);
      this.emit('events-stored', { count: events.length });
    } catch (error) {
      this.handleError(error);
    }
  }

  /**
   * Register a replay listener
   */
  registerListener(listener: EventReplayListener): () => void {
    this.listeners.add(listener);
    this.emit('listener-registered', { count: this.listeners.size });

    // Return unregister function
    return () => {
      this.listeners.delete(listener);
      this.emit('listener-unregistered', { count: this.listeners.size });
    };
  }

  /**
   * Register an error listener
   */
  registerErrorListener(listener: EventReplayErrorListener): () => void {
    this.errorListeners.add(listener);
    return () => {
      this.errorListeners.delete(listener);
    };
  }

  /**
   * Query stored events
   */
  async queryEvents(filter: ReplayFilterCriteria): Promise<any> {
    return this.storage.query(filter);
  }

  /**
   * Start an event replay session
   */
  async startReplay(
    filter: ReplayFilterCriteria,
    options: ReplayOptions = {},
  ): Promise<ReplayResult> {
    const mergedOptions = { ...this.config.defaultReplayOptions, ...options };

    // Create session
    const sessionId = randomUUID();
    const session: ReplaySession = {
      id: sessionId,
      startTime: new Date(),
      status: 'active',
      filter,
      options: mergedOptions,
      totalEvents: 0,
      replayedEvents: 0,
      failedEvents: 0,
      skippedEvents: 0,
      errors: [],
      progress: 0,
    };

    this.activeSessions.set(sessionId, session);
    this.emit('replay-started', { sessionId, filter, options: mergedOptions });

    // Wait for queue slot if needed
    if (this.concurrentReplays >= this.config.maxConcurrentReplays) {
      await new Promise<void>((resolve) => {
        this.replayQueue.push(() => this.executeReplay(session, mergedOptions).then(() => resolve()));
      });
    } else {
      await this.executeReplay(session, mergedOptions);
    }

    // Generate result
    const result = this.generateReplayResult(session);
    this.sessionHistory.set(sessionId, result);
    this.activeSessions.delete(sessionId);

    // Emit completion
    this.emit('replay-completed', result);
    if (this.config.onSessionCompleted) {
      this.config.onSessionCompleted(result);
    }

    return result;
  }

  /**
   * Pause a replay session
   */
  pauseReplay(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    session.status = 'paused';
    this.emit('replay-paused', { sessionId });
    return true;
  }

  /**
   * Resume a replay session
   */
  async resumeReplay(sessionId: string): Promise<boolean> {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'paused') {
      return false;
    }

    session.status = 'active';
    this.emit('replay-resumed', { sessionId });
    // Resume could be implemented with complex session state tracking
    return true;
  }

  /**
   * Cancel a replay session
   */
  cancelReplay(sessionId: string): boolean {
    const session = this.activeSessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    session.status = 'failed';
    this.emit('replay-cancelled', { sessionId });
    return true;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId: string): ReplaySession | null {
    return this.activeSessions.get(sessionId) || null;
  }

  /**
   * Get session history
   */
  getSessionHistory(sessionId: string): ReplayResult | null {
    return this.sessionHistory.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): ReplaySession[] {
    return Array.from(this.activeSessions.values());
  }

  /**
   * Cleanup old events
   */
  async cleanupOldEvents(): Promise<number> {
    const cutoffTime = new Date(Date.now() - this.config.eventRetentionMs);
    return this.storage.deleteRange(new Date(0), cutoffTime);
  }

  /**
   * Get event storage statistics
   */
  async getStorageStats(): Promise<EventAggregationStats> {
    const result = await this.storage.query({});
    const events = result.events;

    const statsByType: Record<string, number> = {};
    const statsByContract: Record<string, number> = {};

    for (const event of events) {
      // Count by type
      statsByType[event.type] = (statsByType[event.type] || 0) + 1;

      // Count by contract
      if (event.contractId) {
        statsByContract[event.contractId] = (statsByContract[event.contractId] || 0) + 1;
      }
    }

    const storageSize = await this.storage.getStorageSize();
    const dates = events.map((e) => e.timestamp.getTime()).sort((a, b) => a - b);

    return {
      totalEvents: events.length,
      eventsByType: statsByType,
      eventsByContract: statsByContract,
      dateRange: {
        oldest: new Date(dates[0] || 0),
        newest: new Date(dates[dates.length - 1] || 0),
      },
      storageSize,
    };
  }

  /**
   * Delete events
   */
  async deleteEvent(eventId: string): Promise<boolean> {
    return this.storage.delete(eventId);
  }

  /**
   * Private helper methods
   */

  private async executeReplay(
    session: ReplaySession,
    options: Required<ReplayOptions>,
  ): Promise<void> {
    this.concurrentReplays++;

    try {
      // Query events
      const queryResult = await this.storage.query(session.filter);
      session.totalEvents = queryResult.total;

      if (options.dryRun) {
        session.replayedEvents = queryResult.events.length;
        return;
      }

      // Replay events
      const events = queryResult.events.slice(0, options.maxEvents);

      for (let i = 0; i < events.length; i++) {
        if (session.status !== 'active') {
          break;
        }

        const event = events[i];

        try {
          // Apply delay for real-time and throttled modes
          if (options.mode === 'real-time' || options.mode === 'throttled') {
            if (i > 0) {
              const timeDiff = events[i - 1].timestamp.getTime() - event.timestamp.getTime();
              const delay = options.mode === 'throttled' ? options.delayMs : Math.abs(timeDiff);
              await this.sleep(Math.min(delay, 60_000)); // Cap at 1 minute
            }
          } else if (options.mode === 'throttled' && options.delayMs > 0) {
            await this.sleep(options.delayMs);
          }

          // Notify listeners
          await this.notifyListeners(event, i, events.length, session.id);
          session.replayedEvents++;
        } catch (error: any) {
          session.failedEvents++;

          const replayError: ReplayError = {
            eventId: event.id,
            error: error?.message || String(error),
            timestamp: new Date(),
            recoverable: options.continueOnError,
          };

          session.errors.push(replayError);
          this.notifyErrorListeners(replayError);

          if (!options.continueOnError) {
            session.status = 'failed';
            throw error;
          }
        }

        // Update progress
        session.progress = Math.round(((i + 1) / events.length) * 100);
        this.emit('replay-progress', { sessionId: session.id, progress: session.progress });
      }

      session.status = 'completed';
    } catch (error) {
      session.status = 'failed';
      this.handleError(error);
    } finally {
      session.endTime = new Date();
      this.concurrentReplays--;

      // Process queue
      if (this.replayQueue.length > 0) {
        const next = this.replayQueue.shift();
        if (next) {
          await next();
        }
      }
    }
  }

  private async notifyListeners(
    event: StoredBridgeEvent,
    index: number,
    total: number,
    sessionId: string,
  ): Promise<void> {
    const promises: Promise<void>[] = [];

    for (const listener of this.listeners) {
      promises.push(
        Promise.resolve()
          .then(() => listener(event, index, total, sessionId))
          .catch((error) => {
            this.handleError(error);
          }),
      );
    }

    await Promise.allSettled(promises);
  }

  private notifyErrorListeners(error: ReplayError): void {
    for (const listener of this.errorListeners) {
      try {
        listener(error);
      } catch (err) {
        this.handleError(err);
      }
    }
  }

  private generateReplayResult(session: ReplaySession): ReplayResult {
    const durationMs = (session.endTime || new Date()).getTime() - session.startTime.getTime();
    const successRate =
      session.totalEvents > 0
        ? session.replayedEvents / session.totalEvents
        : 0;
    const eventsPerSecond = durationMs > 0 ? (session.replayedEvents * 1000) / durationMs : 0;

    const statistics: ReplayStatistics = {
      sessionId: session.id,
      totalEvents: session.totalEvents,
      replayedEvents: session.replayedEvents,
      failedEvents: session.failedEvents,
      skippedEvents: session.skippedEvents,
      startTime: session.startTime,
      endTime: session.endTime || new Date(),
      durationMs,
      eventsPerSecond: Math.round(eventsPerSecond * 100) / 100,
      successRate: Math.round(successRate * 10000) / 100, // Percentage
      averageEventSize: 0,
      errors: session.errors,
    };

    return {
      sessionId: session.id,
      success: session.status === 'completed' && session.failedEvents === 0,
      statistics,
      errors: session.errors,
      warnings: this.generateWarnings(session, statistics),
    };
  }

  private generateWarnings(session: ReplaySession, stats: ReplayStatistics): string[] {
    const warnings: string[] = [];

    if (stats.successRate < 1) {
      warnings.push(
        `${Math.round((1 - stats.successRate) * 100)}% of events failed during replay`,
      );
    }

    if (stats.eventsPerSecond < 100 && session.options.mode === 'fast') {
      warnings.push('Replay rate is below expected threshold; check system resources');
    }

    if (session.errors.length > 0) {
      const criticalErrors = session.errors.filter((e) => !e.recoverable).length;
      if (criticalErrors > 0) {
        warnings.push(`${criticalErrors} critical errors encountered during replay`);
      }
    }

    return warnings;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private handleError(error: unknown): void {
    if (this.config.onError) {
      this.config.onError(error);
    }
    if (this.config.verbose) {
      console.error('[SorobanEventReplayProcessor]', error);
    }
  }
}
