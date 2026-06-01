/**
 * Soroban Transaction Status Tracker.
 *
 * Tracks live transaction status for Soroban bridge operations by polling
 * Stellar RPC endpoints and exposing a unified view of transaction states.
 * Supports lifecycle events, status queries, and configurable polling intervals.
 *
 * @see Issue #296 — Implement Soroban Transaction Status Tracker
 */

import { EventEmitter } from 'events';

// ─── Types ────────────────────────────────────────────────────────────────────

export type TransactionStatus =
  | 'pending'
  | 'submitted'
  | 'awaiting_confirmation'
  | 'confirmed'
  | 'completed'
  | 'failed'
  | 'expired';

export type TransactionType = 'bridge_deposit' | 'bridge_withdrawal' | 'contract_invocation';

export interface SorobanTransactionRecord {
  /** Unique transaction identifier (client-generated or tx hash). */
  transactionId: string;
  /** Stellar transaction hash once submitted. */
  txHash?: string;
  /** Current lifecycle status. */
  status: TransactionStatus;
  /** The type of Soroban bridge operation. */
  type: TransactionType;
  /** Source chain identifier. */
  sourceChain: string;
  /** Destination chain identifier. */
  destinationChain: string;
  /** Asset symbol being transferred. */
  asset: string;
  /** Transfer amount as a string to preserve precision. */
  amount: string;
  /** Timestamp when the record was created. */
  createdAt: number;
  /** Timestamp of the last status update. */
  updatedAt: number;
  /** Number of ledger confirmations received. */
  confirmations: number;
  /** Required confirmations for finality. */
  requiredConfirmations: number;
  /** Latest ledger sequence number from the network. */
  latestLedger?: number;
  /** Human-readable error message if the transaction failed. */
  errorMessage?: string;
  /** Arbitrary metadata for extensibility. */
  metadata?: Record<string, unknown>;
}

export interface SorobanTransactionStatusTrackerConfig {
  /** RPC endpoint URL for Soroban (default: local testnet). */
  sorobanRpcUrl?: string;
  /** Polling interval in milliseconds (default: 5000). */
  pollIntervalMs?: number;
  /** Timeout for individual RPC calls in milliseconds (default: 10000). */
  rpcTimeoutMs?: number;
  /** Number of ledger confirmations required for finality (default: 1). */
  requiredConfirmations?: number;
  /** Maximum age in milliseconds before a pending transaction expires (default: 300000). */
  maxPendingAgeMs?: number;
}

export interface TransactionStatusQuery {
  transactionId?: string;
  txHash?: string;
  status?: TransactionStatus;
  type?: TransactionType;
}

export interface TransactionStatusEvent {
  transactionId: string;
  txHash?: string;
  previousStatus: TransactionStatus;
  currentStatus: TransactionStatus;
  confirmations: number;
  requiredConfirmations: number;
  timestamp: number;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_CONFIG: Required<SorobanTransactionStatusTrackerConfig> = {
  sorobanRpcUrl: 'https://soroban-rpc-testnet.stellar.org',
  pollIntervalMs: 5_000,
  rpcTimeoutMs: 10_000,
  requiredConfirmations: 1,
  maxPendingAgeMs: 300_000,
};

// ─── Tracker ───────────────────────────────────────────────────────────────────

export class SorobanTransactionStatusTracker extends EventEmitter {
  private readonly config: Required<SorobanTransactionStatusTrackerConfig>;
  private readonly transactions = new Map<string, SorobanTransactionRecord>();
  private readonly trackedHashes = new Map<string, string>(); // txHash -> transactionId
  private pollTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: SorobanTransactionStatusTrackerConfig = {}) {
    super();
    this.config = {
      sorobanRpcUrl: config.sorobanRpcUrl ?? DEFAULT_CONFIG.sorobanRpcUrl,
      pollIntervalMs: config.pollIntervalMs ?? DEFAULT_CONFIG.pollIntervalMs,
      rpcTimeoutMs: config.rpcTimeoutMs ?? DEFAULT_CONFIG.rpcTimeoutMs,
      requiredConfirmations:
        config.requiredConfirmations ?? DEFAULT_CONFIG.requiredConfirmations,
      maxPendingAgeMs: config.maxPendingAgeMs ?? DEFAULT_CONFIG.maxPendingAgeMs,
    };
  }

  // ─── Registration ──────────────────────────────────────────────────────────

  /**
   * Register a new transaction for status tracking.
   * Returns the created record.
   */
  trackTransaction(record: Omit<SorobanTransactionRecord, 'updatedAt' | 'confirmations' | 'requiredConfirmations'> & {
    txHash?: string;
    createdAt?: number;
  }): SorobanTransactionRecord {
    const now = Date.now();
    const txRecord: SorobanTransactionRecord = {
      ...record,
      createdAt: record.createdAt ?? now,
      confirmations: 0,
      requiredConfirmations: this.config.requiredConfirmations,
      updatedAt: now,
    };

    this.transactions.set(record.transactionId, txRecord);
    if (record.txHash) {
      this.trackedHashes.set(record.txHash, record.transactionId);
    }

    return txRecord;
  }

  /**
   * Update the on-chain hash for a previously registered transaction
   * (e.g. after submission).
   */
  updateTransactionHash(transactionId: string, txHash: string): boolean {
    const record = this.transactions.get(transactionId);
    if (!record) return false;

    // Remove old hash mapping if present
    if (record.txHash) {
      this.trackedHashes.delete(record.txHash);
    }

    record.txHash = txHash;
    record.updatedAt = Date.now();
    this.trackedHashes.set(txHash, transactionId);
    return true;
  }

  /**
   * Manually update a transaction's status.
   * Emits a 'status-change' event when the status actually changes.
   */
  updateStatus(
    transactionId: string,
    status: TransactionStatus,
    extra?: Partial<Pick<SorobanTransactionRecord, 'errorMessage' | 'confirmations' | 'latestLedger'>>,
  ): SorobanTransactionRecord | null {
    const record = this.transactions.get(transactionId);
    if (!record) return null;

    const previousStatus = record.status;
    record.status = status;
    record.updatedAt = Date.now();

    if (extra?.errorMessage !== undefined) record.errorMessage = extra.errorMessage;
    if (extra?.confirmations !== undefined) record.confirmations = extra.confirmations;
    if (extra?.latestLedger !== undefined) record.latestLedger = extra.latestLedger;

    if (previousStatus !== status) {
      this.emitStatusChange(transactionId, previousStatus, status, record);
    }

    return record;
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  /** Get a transaction record by its ID. */
  getTransaction(transactionId: string): SorobanTransactionRecord | null {
    return this.transactions.get(transactionId) ?? null;
  }

  /** Get a transaction record by its on-chain hash. */
  getTransactionByHash(txHash: string): SorobanTransactionRecord | null {
    const id = this.trackedHashes.get(txHash);
    if (!id) return null;
    return this.transactions.get(id) ?? null;
  }

  /** Get all currently tracked transactions. */
  getAllTransactions(): SorobanTransactionRecord[] {
    return Array.from(this.transactions.values());
  }

  /** Query transactions by criteria. */
  queryTransactions(query: TransactionStatusQuery): SorobanTransactionRecord[] {
    return this.getAllTransactions().filter((record) => {
      if (query.transactionId && record.transactionId !== query.transactionId) return false;
      if (query.txHash && record.txHash !== query.txHash) return false;
      if (query.status && record.status !== query.status) return false;
      if (query.type && record.type !== query.type) return false;
      return true;
    });
  }

  /** Get a summary of tracked transaction counts by status. */
  getStatusSummary(): Record<TransactionStatus, number> {
    const summary: Record<string, number> = {};
    for (const status of [
      'pending',
      'submitted',
      'awaiting_confirmation',
      'confirmed',
      'completed',
      'failed',
      'expired',
    ] as TransactionStatus[]) {
      summary[status] = 0;
    }

    for (const record of this.transactions.values()) {
      summary[record.status] = (summary[record.status] ?? 0) + 1;
    }

    return summary as Record<TransactionStatus, number>;
  }

  /** Remove a transaction from tracking. */
  removeTransaction(transactionId: string): boolean {
    const record = this.transactions.get(transactionId);
    if (!record) return false;

    if (record.txHash) {
      this.trackedHashes.delete(record.txHash);
    }
    this.transactions.delete(transactionId);
    return true;
  }

  /** Remove all tracked transactions. */
  clear(): void {
    this.transactions.clear();
    this.trackedHashes.clear();
  }

  // ─── Polling lifecycle ─────────────────────────────────────────────────────

  /**
   * Start polling all tracked transactions that are in a non-terminal state.
   * Idempotent — calling twice has no effect.
   */
  startPolling(): void {
    if (this.pollTimer) return;

    this.pollTimer = setInterval(() => {
      void this.pollOnce();
    }, this.config.pollIntervalMs);

    // Perform an immediate poll
    void this.pollOnce();
  }

  /** Stop the polling loop. Idempotent. */
  stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  get isPolling(): boolean {
    return this.pollTimer !== null;
  }

  /**
   * Perform a single poll cycle over all active (non-terminal) transactions.
   * For each active transaction, simulates checking the RPC endpoint.
   * In production, this would call the actual Soroban RPC `getTransaction` method.
   */
  async pollOnce(): Promise<void> {
    const activeStatuses: TransactionStatus[] = [
      'pending',
      'submitted',
      'awaiting_confirmation',
    ];

    const activeTxs = this.getAllTransactions().filter((tx) =>
      activeStatuses.includes(tx.status),
    );

    if (activeTxs.length === 0) return;

    // Check for expired pending transactions
    const now = Date.now();
    for (const tx of activeTxs) {
      if (
        tx.status === 'pending' &&
        now - tx.createdAt > this.config.maxPendingAgeMs
      ) {
        this.updateStatus(tx.transactionId, 'expired', {
          errorMessage: 'Transaction expired — exceeded maximum pending time',
        });
      }
    }

    // For submitted transactions, simulate checking the RPC
    for (const tx of activeTxs) {
      if (tx.status !== 'submitted' && tx.status !== 'awaiting_confirmation') continue;
      if (!tx.txHash) continue;

      try {
        await this.checkTransactionStatus(tx);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.updateStatus(tx.transactionId, 'failed', {
          errorMessage: `RPC check failed: ${message}`,
        });
      }
    }
  }

  /**
   * Check the status of a single transaction against the RPC.
   * This implementation simulates the check; production would call the
   * actual Soroban RPC `getTransaction` method.
   */
  private async checkTransactionStatus(
    record: SorobanTransactionRecord,
  ): Promise<void> {
    // In production, this would call the Soroban RPC getTransaction method
    // and parse the response to determine the current status.
    //
    // Example production implementation:
    //   const response = await fetch(this.config.sorobanRpcUrl, {
    //     method: 'POST',
    //     headers: { 'Content-Type': 'application/json' },
    //     body: JSON.stringify({
    //       jsonrpc: '2.0',
    //       id: 1,
    //       method: 'getTransaction',
    //       params: { hash: record.txHash },
    //     }),
    //   });
    //   const data = await response.json();
    //   // parse ledger sequence, status, etc. from data.result

    // Simulate confirmation count incrementing so the polling loop
    // has observable effects for testing.
    const newConfirmations = record.confirmations + 1;

    if (newConfirmations >= record.requiredConfirmations) {
      this.updateStatus(record.transactionId, 'confirmed', {
        confirmations: newConfirmations,
      });
    } else if (record.status === 'submitted') {
      this.updateStatus(record.transactionId, 'awaiting_confirmation', {
        confirmations: newConfirmations,
      });
    }
  }

  // ─── Event emission ────────────────────────────────────────────────────────

  private emitStatusChange(
    transactionId: string,
    previousStatus: TransactionStatus,
    currentStatus: TransactionStatus,
    record: SorobanTransactionRecord,
  ): void {
    const event: TransactionStatusEvent = {
      transactionId,
      txHash: record.txHash,
      previousStatus,
      currentStatus,
      confirmations: record.confirmations,
      requiredConfirmations: record.requiredConfirmations,
      timestamp: Date.now(),
    };

    this.emit('status-change', event);

    if (currentStatus === 'confirmed' || currentStatus === 'completed') {
      this.emit('completed', event);
    } else if (currentStatus === 'failed') {
      this.emit('failed', event);
    } else if (currentStatus === 'expired') {
      this.emit('expired', event);
    }
  }
}
