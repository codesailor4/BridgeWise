/**
 * Stellar Transfer Timeout Detection - Type Definitions
 */

/** Possible states a tracked transfer can be in */
export enum TransferState {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  TIMED_OUT = 'timed_out',
  FAILED = 'failed',
}

/** Severity level of a timeout event */
export enum TimeoutSeverity {
  WARNING = 'warning',   // approaching threshold
  CRITICAL = 'critical', // threshold exceeded
}

/** A Stellar bridge transfer being tracked */
export interface TrackedTransfer {
  /** Unique transfer identifier (transaction hash or internal ID) */
  transferId: string;
  /** Stellar source account */
  sourceAccount: string;
  /** Destination account or contract */
  destinationAccount: string;
  /** Asset code (e.g. XLM, USDC) */
  asset: string;
  /** Transfer amount as string to preserve precision */
  amount: string;
  /** Current state */
  state: TransferState;
  /** When the transfer was first registered */
  registeredAt: Date;
  /** When the state last changed */
  lastUpdatedAt: Date;
  /** Stellar ledger sequence at registration (optional) */
  ledgerAtRegistration?: number;
  /** Arbitrary metadata (bridge name, route info, etc.) */
  metadata?: Record<string, unknown>;
}

/** A detected timeout event */
export interface TimeoutEvent {
  transferId: string;
  severity: TimeoutSeverity;
  elapsedMs: number;
  thresholdMs: number;
  detectedAt: Date;
  transfer: TrackedTransfer;
}

/** Result of a single transfer status check */
export interface TransferStatusCheck {
  transferId: string;
  state: TransferState;
  elapsedMs: number;
  isTimedOut: boolean;
  isWarning: boolean;
  checkedAt: Date;
}

/** Summary produced by the periodic scan */
export interface TimeoutScanSummary {
  scannedAt: Date;
  totalTracked: number;
  timedOut: number;
  warnings: number;
  completed: number;
  events: TimeoutEvent[];
}

/** Configuration thresholds for timeout detection */
export interface TimeoutThresholds {
  /** Warn after this many ms without completion (default 2 min) */
  warningMs: number;
  /** Mark as timed-out after this many ms (default 5 min) */
  criticalMs: number;
}
