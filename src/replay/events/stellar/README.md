/**
 * Soroban Event Replay Processor - Implementation Guide
 */

# Soroban Event Replay Processor

## Overview

The Soroban Event Replay Processor enables developers to replay historical bridge events for debugging, testing, and analytics. It provides a comprehensive event storage and replay system with flexible filtering, multiple replay modes, and detailed statistics.

## Features

✅ **Event Storage** - Efficient in-memory event storage with LRU eviction  
✅ **Flexible Querying** - Powerful filter criteria with indexing for fast queries  
✅ **Multiple Replay Modes** - Fast, real-time, throttled, and step-by-step playback  
✅ **Listener System** - Register listeners to receive replayed events  
✅ **Session Management** - Track replay sessions with detailed statistics  
✅ **Error Handling** - Graceful error handling with recovery options  
✅ **Query Builder** - Fluent API for building complex queries  
✅ **Storage Statistics** - Monitor storage usage and event distribution

## Installation

The event replay module is located at `src/replay/events/stellar/` and can be imported as:

```typescript
import {
  SorobanEventReplayProcessor,
  createReplayQuery,
  ReplayQueryPresets,
} from '@/replay/events/stellar';
```

## Quick Start

### 1. Create a Processor Instance

```typescript
import { SorobanEventReplayProcessor } from '@/replay/events/stellar';

const processor = new SorobanEventReplayProcessor({
  inMemoryStorage: {
    maxEvents: 100_000,
    ttl: 30 * 24 * 60 * 60 * 1000, // 30 days
    autoCleanup: true,
  },
  defaultReplayOptions: {
    mode: 'fast',
    continueOnError: true,
  },
});
```

### 2. Store Events

```typescript
import type { StoredRawBridgeEvent } from '@/replay/events/stellar';

const bridgeEvent: StoredRawBridgeEvent = {
  id: 'evt-001',
  timestamp: new Date(),
  source: 'stellar-bridge',
  type: 'transfer',
  payload: {
    amount: '1000000000',
    destination: 'GBUQWP3BOUZX34ULNQG23RQ6F4PFXKEC6FMBLIOTXHLHAPXVUJP3ORCZ',
  },
  contractId: 'CADSCVF4MFXTV2HFYGDYXFCL3IUJG5LPNWGZYHXU6QTHGDQBGIXW5KQ',
  transactionHash: 'abc123...',
  sequenceNumber: 100,
  ledgerSequence: 50000,
  sourceAccount: 'GBUQWP3BOUZX34ULNQG23RQ6F4PFXKEC6FMBLIOTXHLHAPXVUJP3ORCZ',
};

await processor.storeEvent(bridgeEvent);

// Or store multiple events
await processor.storeEvents([bridgeEvent, ...otherEvents]);
```

### 3. Register Listeners

```typescript
// Register a listener to receive replayed events
const unregister = processor.registerListener((event, index, total, sessionId) => {
  console.log(`Replaying event ${index + 1}/${total}: ${event.type}`);
  // Handle replayed event
  handleReplayedEvent(event);
});

// Register error listener
processor.registerErrorListener((error) => {
  console.error(`Replay error: ${error.error}`);
});
```

### 4. Replay Events

```typescript
// Simple replay - all events in fast mode
const result = await processor.startReplay({});

console.log(`Replayed ${result.statistics.replayedEvents} events`);
console.log(`Duration: ${result.statistics.durationMs}ms`);
console.log(`Events/sec: ${result.statistics.eventsPerSecond}`);

// Replay with filters
const result = await processor.startReplay(
  {
    eventTypes: ['transfer'],
    startTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
    contractId: 'CADSCVF4MFXTV2HFYGDYXFCL3IUJG5LPNWGZYHXU6QTHGDQBGIXW5KQ',
  },
  {
    mode: 'throttled',
    delayMs: 100,
    continueOnError: true,
  },
);
```

## API Reference

### SorobanEventReplayProcessor

#### Constructor

```typescript
new SorobanEventReplayProcessor(config?: SorobanEventReplayProcessorConfig)
```

**Config Options:**
- `storageBackend` - Custom storage backend (defaults to InMemoryEventStorage)
- `inMemoryStorage` - Configuration for in-memory storage
- `defaultReplayOptions` - Default options for replay operations
- `eventRetentionMs` - How long to keep events (default: 30 days)
- `cleanupIntervalMs` - Interval for automatic cleanup
- `maxConcurrentReplays` - Max concurrent replay sessions
- `verbose` - Enable verbose logging
- `onError` - Error handler callback
- `onSessionCompleted` - Callback when replay completes

#### Methods

```typescript
// Event Management
storeEvent(event: StoredBridgeEvent): Promise<void>
storeEvents(events: StoredBridgeEvent[]): Promise<void>

// Listener Management
registerListener(listener: EventReplayListener): () => void
registerErrorListener(listener: EventReplayErrorListener): () => void

// Querying
queryEvents(filter: ReplayFilterCriteria): Promise<EventQueryResult>

// Replay Operations
startReplay(filter: ReplayFilterCriteria, options?: ReplayOptions): Promise<ReplayResult>
pauseReplay(sessionId: string): boolean
resumeReplay(sessionId: string): Promise<boolean>
cancelReplay(sessionId: string): boolean

// Session Management
getSessionStats(sessionId: string): ReplaySession | null
getSessionHistory(sessionId: string): ReplayResult | null
getActiveSessions(): ReplaySession[]

// Storage Management
getStorageStats(): Promise<EventAggregationStats>
cleanupOldEvents(): Promise<number>
deleteEvent(eventId: string): Promise<boolean>
```

#### Events

```typescript
processor.on('event-stored', (event: StoredBridgeEvent) => {})
processor.on('events-stored', ({ count: number }) => {})
processor.on('listener-registered', ({ count: number }) => {})
processor.on('listener-unregistered', ({ count: number }) => {})
processor.on('replay-started', ({ sessionId, filter, options }) => {})
processor.on('replay-progress', ({ sessionId, progress }) => {})
processor.on('replay-completed', (result: ReplayResult) => {})
processor.on('replay-paused', ({ sessionId }) => {})
processor.on('replay-resumed', ({ sessionId }) => {})
processor.on('replay-cancelled', ({ sessionId }) => {})
```

### ReplayFilterCriteria

```typescript
interface ReplayFilterCriteria {
  // Time-based
  startTime?: Date;
  endTime?: Date;

  // Event type
  eventTypes?: ReplayableEventType[];

  // Addresses
  fromAddress?: string;
  toAddress?: string;
  addresses?: string[];

  // Contract
  contractId?: string;
  contractIds?: string[];

  // Transaction
  transactionHash?: string;
  sequenceNumber?: number;
  ledgerSequence?: number;
  sourceAccount?: string;

  // Amount/Asset
  minAmount?: string;
  maxAmount?: string;
  asset?: string;
  assets?: string[];

  // Metadata
  hasMetadata?: boolean;
  metadataMatches?: Record<string, any>;

  // Pagination
  limit?: number;
  offset?: number;

  // Custom predicate
  predicate?: (event: StoredBridgeEvent) => boolean;
}
```

### ReplayOptions

```typescript
interface ReplayOptions {
  mode?: 'fast' | 'real-time' | 'throttled' | 'step-by-step';
  delayMs?: number;
  continueOnError?: boolean;
  preserveTimestamps?: boolean;
  maxEvents?: number;
  batchSize?: number;
  context?: Record<string, any>;
  normalize?: boolean;
  dryRun?: boolean;
}
```

### Query Builder

```typescript
import { createReplayQuery, ReplayQueryPresets } from '@/replay/events/stellar';

// Build queries fluently
const query = createReplayQuery()
  .ofType('transfer')
  .lastDays(7)
  .minAmount('1000000')
  .forContract(contractId)
  .limit(100)
  .build();

const result = await processor.queryEvents(query);

// Use presets
const recentTransfers = ReplayQueryPresets.transfers().lastDays(1).build();
const highValue = ReplayQueryPresets.highValueTransfers('1000000000').build();
const contractEvents = ReplayQueryPresets.contractEvents(contractId).build();
const addressHistory = ReplayQueryPresets.addressEvents(address).build();
```

## Examples

### Example 1: Replay Events for Debugging

```typescript
import { SorobanEventReplayProcessor, createReplayQuery } from '@/replay/events/stellar';

const processor = new SorobanEventReplayProcessor();

// Collect events during normal operation
async function captureEvents(event) {
  await processor.storeEvent(event);
}

// Later, replay for debugging
async function debugTransaction(transactionHash) {
  const debugListener = (event) => {
    console.log('Event during replay:', event);
    inspectEventDetails(event);
  };

  processor.registerListener(debugListener);

  const result = await processor.startReplay(
    { transactionHash },
    { mode: 'step-by-step' },
  );

  console.log(`Replayed ${result.statistics.replayedEvents} events`);
}
```

### Example 2: Replay with Filtering

```typescript
// Replay all transfer events from the last 24 hours
const result = await processor.startReplay(
  {
    eventTypes: ['transfer'],
    startTime: new Date(Date.now() - 24 * 60 * 60 * 1000),
  },
  { mode: 'fast' },
);

console.log(`Success rate: ${(result.statistics.successRate * 100).toFixed(2)}%`);
```

### Example 3: Track Replay Progress

```typescript
processor.on('replay-progress', ({ progress }) => {
  console.log(`Replay progress: ${progress}%`);
});

processor.on('replay-completed', (result) => {
  console.log('Replay complete:');
  console.log(`  Total events: ${result.statistics.totalEvents}`);
  console.log(`  Replayed: ${result.statistics.replayedEvents}`);
  console.log(`  Failed: ${result.statistics.failedEvents}`);
  console.log(`  Duration: ${result.statistics.durationMs}ms`);
  console.log(`  Events/sec: ${result.statistics.eventsPerSecond}`);
});

await processor.startReplay({});
```

### Example 4: Analyze Events

```typescript
// Get storage statistics
const stats = await processor.getStorageStats();

console.log(`Total events: ${stats.totalEvents}`);
console.log(`Events by type:`, stats.eventsByType);
console.log(`Events by contract:`, stats.eventsByContract);
console.log(`Storage size: ${(stats.storageSize / 1024 / 1024).toFixed(2)}MB`);

// Query specific events
const query = createReplayQuery()
  .lastDays(7)
  .ofTypes('transfer', 'mint')
  .minAmount('1000000')
  .limit(1000)
  .build();

const result = await processor.queryEvents(query);
console.log(`Found ${result.total} events`);
```

### Example 5: Real-time Replay

```typescript
// Replay events at real-time speed based on original timestamps
const result = await processor.startReplay(
  {
    startTime: new Date('2024-01-01'),
    endTime: new Date('2024-01-02'),
  },
  {
    mode: 'real-time',
    preserveTimestamps: true,
  },
);

console.log(`Real-time replay completed in ${result.statistics.durationMs}ms`);
```

### Example 6: Error Handling

```typescript
processor.registerListener((event) => {
  if (event.type === 'unknown') {
    throw new Error(`Unknown event type: ${JSON.stringify(event)}`);
  }
});

processor.registerErrorListener((error) => {
  console.error(`Failed to process event ${error.eventId}: ${error.error}`);
  if (error.recoverable) {
    console.log('Continuing replay...');
  }
});

const result = await processor.startReplay({}, { continueOnError: true });

// Review errors after replay
result.errors.forEach((err) => {
  console.log(`Event ${err.eventId}: ${err.error} (${err.severity})`);
});
```

## Replay Modes

### Fast Mode
- Replays all events as quickly as possible
- No delay between events
- Best for batch processing and analytics
- Default mode

### Real-time Mode
- Replays events with original timestamps preserved
- Delays between events match original timing
- Useful for reproducing exact flow scenarios
- Capped at 1-minute delays

### Throttled Mode
- Applies fixed delay between events
- Configurable via `delayMs` option
- Useful for controlled testing
- Default delay: 100ms

### Step-by-step Mode
- Pauses between events
- Allows interactive debugging
- Can be extended for pause/resume

## Performance Considerations

- **Storage**: Default 100K events with 30-day TTL
- **Memory**: Each event ~500 bytes average
- **Indexing**: Enabled by default for fast queries
- **Concurrency**: Max 5 concurrent replays by default
- **Cleanup**: Automatic TTL-based cleanup every 24 hours

## Troubleshooting

### Events Not Stored
- Check processor is initialized
- Verify event ID is unique
- Check storage limit not exceeded

### Replay Not Triggering Listeners
- Confirm listeners registered before replay
- Check query filters match events
- Verify events exist with `queryEvents()`

### Memory Usage High
- Reduce `maxEvents` in config
- Decrease `ttl` for older events
- Increase cleanup frequency

### Slow Queries
- Add more specific filters
- Enable indexing
- Paginate results with limit/offset

## Integration with BridgeWise

To integrate event replay into BridgeWise:

```typescript
import { SorobanEventReplayProcessor } from '@/replay/events/stellar';
import { SorobanBridgeEventAggregator } from '@/events/aggregation/stellar';

// Setup replay processor
const replayProcessor = new SorobanEventReplayProcessor();

// Capture events from aggregator
const aggregator = new SorobanBridgeEventAggregator();
aggregator.subscribe((events) => {
  replayProcessor.storeEvents(
    events.map((e) => ({
      id: generateId(),
      timestamp: new Date(),
      source: 'aggregator',
      type: e.type,
      payload: e,
      contractId: e.contractId,
    })),
  );
});

// Use for debugging or analytics
export { replayProcessor };
```
