export type AuditEventType =
  | 'transfer.initiated'
  | 'transfer.submitted'
  | 'transfer.confirmed'
  | 'transfer.failed'
  | 'transfer.refunded'
  | 'provider.registered'
  | 'provider.deregistered';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  transferId?: string;
  providerId?: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface AuditSearchQuery {
  type?: AuditEventType;
  transferId?: string;
  providerId?: string;
  /** Only return events at or after this epoch ms timestamp. */
  fromTimestamp?: number;
  /** Only return events at or before this epoch ms timestamp. */
  toTimestamp?: number;
}

export interface AuditLoggerConfig {
  /** Maximum number of events to retain (oldest are evicted). Default 10_000. */
  maxEvents?: number;
  /** Injected clock for deterministic testing. Defaults to Date.now. */
  now?: () => number;
  /** Injected id generator for deterministic testing. Defaults to crypto.randomUUID. */
  idGen?: () => string;
}
