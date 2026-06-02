/**
 * Soroban Event Replay Types
 * Defines interfaces for event storage, filtering, and replay
 */

/**
 * Supported event types that can be replayed
 */
export type ReplayableEventType =
  | 'transfer'
  | 'mint'
  | 'burn'
  | 'approval'
  | 'contract_call'
  | 'balance_change'
  | 'unknown';

/**
 * Raw bridge event structure for storage
 */
export interface StoredRawBridgeEvent {
  id: string; // Unique event ID
  timestamp: Date;
  source: string;
  type: ReplayableEventType;
  payload: Record<string, any>;
  contractId?: string;
  transactionHash?: string;
  sequenceNumber?: number;
  ledgerSequence?: number;
  sourceAccount?: string;
  metadata?: Record<string, any>;
}

/**
 * Normalized bridge event for replay
 */
export interface StoredNormalizedBridgeEvent {
  id: string;
  timestamp: Date;
  rawEventId: string;
  type: ReplayableEventType;
  from?: string;
  to?: string;
  amount?: string;
  asset?: string;
  contractId?: string;
  normalized: true;
  metadata?: Record<string, any>;
}

export type StoredBridgeEvent = StoredRawBridgeEvent | StoredNormalizedBridgeEvent;

/**
 * Event replay filter criteria
 */
export interface ReplayFilterCriteria {
  // Time-based filtering
  startTime?: Date;
  endTime?: Date;

  // Event type filtering
  eventTypes?: ReplayableEventType[];

  // Address filtering
  fromAddress?: string;
  toAddress?: string;
  addresses?: string[]; // Match either from or to

  // Contract filtering
  contractId?: string;
  contractIds?: string[];

  // Transaction filtering
  transactionHash?: string;
  sequenceNumber?: number;
  ledgerSequence?: number;
  sourceAccount?: string;

  // Amount/Asset filtering
  minAmount?: string;
  maxAmount?: string;
  asset?: string;
  assets?: string[];

  // Metadata filtering
  hasMetadata?: boolean;
  metadataMatches?: Record<string, any>;

  // Custom predicate
  predicate?: (event: StoredBridgeEvent) => boolean;

  // Pagination
  limit?: number;
  offset?: number;
}

/**
 * Replay execution mode
 */
export type ReplayMode = 'fast' | 'real-time' | 'throttled' | 'step-by-step';

/**
 * Event replay execution options
 */
export interface ReplayOptions {
  // Replay mode
  mode?: ReplayMode;

  // For throttled mode: delay between events (ms)
  delayMs?: number;

  // Whether to skip failed replays
  continueOnError?: boolean;

  // Emit original timestamps as metadata
  preserveTimestamps?: boolean;

  // Maximum number of events to replay
  maxEvents?: number;

  // Batch size for processing
  batchSize?: number;

  // Custom data to pass to listeners
  context?: Record<string, any>;

  // Whether to normalize events before replaying
  normalize?: boolean;

  // Dry run mode (don't actually emit events)
  dryRun?: boolean;
}

/**
 * Event replay session
 */
export interface ReplaySession {
  id: string;
  startTime: Date;
  endTime?: Date;
  status: 'active' | 'completed' | 'failed' | 'paused';
  filter: ReplayFilterCriteria;
  options: ReplayOptions;
  totalEvents: number;
  replayedEvents: number;
  failedEvents: number;
  skippedEvents: number;
  errors: ReplayError[];
  progress: number; // 0-100
}

/**
 * Event replay error
 */
export interface ReplayError {
  eventId: string;
  error: string;
  timestamp: Date;
  recoverable: boolean;
}

/**
 * Event replay statistics
 */
export interface ReplayStatistics {
  sessionId: string;
  totalEvents: number;
  replayedEvents: number;
  failedEvents: number;
  skippedEvents: number;
  startTime: Date;
  endTime: Date;
  durationMs: number;
  eventsPerSecond: number;
  successRate: number; // 0-1
  averageEventSize: number;
  errors: ReplayError[];
}

/**
 * Event replay result
 */
export interface ReplayResult {
  sessionId: string;
  success: boolean;
  statistics: ReplayStatistics;
  errors: ReplayError[];
  warnings: string[];
}

/**
 * Event storage query result
 */
export interface EventQueryResult {
  events: StoredBridgeEvent[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Event replay listener
 */
export type EventReplayListener = (
  event: StoredBridgeEvent,
  index: number,
  total: number,
  sessionId: string,
) => void | Promise<void>;

/**
 * Event replay error listener
 */
export type EventReplayErrorListener = (error: ReplayError) => void;

/**
 * Event storage backend interface
 */
export interface EventStorageBackend {
  // Storage operations
  store(event: StoredBridgeEvent): Promise<void>;
  storeMultiple(events: StoredBridgeEvent[]): Promise<void>;

  // Query operations
  query(filter: ReplayFilterCriteria): Promise<EventQueryResult>;
  get(eventId: string): Promise<StoredBridgeEvent | null>;
  getByTransactionHash(hash: string): Promise<StoredBridgeEvent[]>;

  // Deletion operations
  delete(eventId: string): Promise<boolean>;
  deleteRange(startTime: Date, endTime: Date): Promise<number>;

  // Statistics
  count(filter?: ReplayFilterCriteria): Promise<number>;
  getStorageSize(): Promise<number>;

  // Cleanup
  cleanup(): Promise<void>;
}

/**
 * In-memory event storage configuration
 */
export interface InMemoryEventStorageConfig {
  // Maximum events to store
  maxEvents?: number;

  // Time-to-live for events (ms)
  ttl?: number;

  // Enable auto-cleanup on TTL expiration
  autoCleanup?: boolean;

  // Cleanup interval (ms)
  cleanupInterval?: number;

  // Enable indexing for faster queries
  enableIndexing?: boolean;
}

/**
 * Soroban Event Replay Processor configuration
 */
export interface SorobanEventReplayProcessorConfig {
  // Storage backend
  storageBackend?: EventStorageBackend;

  // In-memory storage config (if backend not provided)
  inMemoryStorage?: InMemoryEventStorageConfig;

  // Default replay options
  defaultReplayOptions?: ReplayOptions;

  // Event retention period (ms)
  eventRetentionMs?: number;

  // Auto-cleanup interval
  cleanupIntervalMs?: number;

  // Maximum concurrent replays
  maxConcurrentReplays?: number;

  // Enable verbose logging
  verbose?: boolean;

  // Error handler
  onError?: (error: unknown) => void;

  // Session completed handler
  onSessionCompleted?: (result: ReplayResult) => void;
}

/**
 * Event aggregation statistics
 */
export interface EventAggregationStats {
  totalEvents: number;
  eventsByType: Record<ReplayableEventType, number>;
  eventsByContract: Record<string, number>;
  dateRange: {
    oldest: Date;
    newest: Date;
  };
  storageSize: number;
}
