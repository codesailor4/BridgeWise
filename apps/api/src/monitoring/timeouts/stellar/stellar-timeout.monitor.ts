/**
 * Stellar Transfer Timeout Monitor
 *
 * Tracks active Stellar bridge transfers and detects stalled or delayed ones.
 * Emits events when warning/critical thresholds are crossed.
 *
 * Usage:
 *   - Call `register()` when a transfer starts.
 *   - Call `markCompleted()` / `markFailed()` when it resolves.
 *   - The scheduler calls `scan()` periodically to detect timeouts.
 */

import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  TrackedTransfer,
  TransferState,
  TimeoutEvent,
  TimeoutSeverity,
  TransferStatusCheck,
  TimeoutScanSummary,
  TimeoutThresholds,
} from './stellar-timeout.types';
import {
  DEFAULT_WARNING_THRESHOLD_MS,
  DEFAULT_CRITICAL_THRESHOLD_MS,
  MAX_RESOLVED_HISTORY,
  TIMEOUT_DETECTED_EVENT,
  TRANSFER_COMPLETED_EVENT,
} from './stellar-timeout.constants';

@Injectable()
export class StellarTimeoutMonitor {
  private readonly logger = new Logger(StellarTimeoutMonitor.name);

  /** Active transfers (pending / in_progress) */
  private readonly active = new Map<string, TrackedTransfer>();

  /** Resolved transfers kept for history queries */
  private readonly resolved: TrackedTransfer[] = [];

  private thresholds: TimeoutThresholds = {
    warningMs: DEFAULT_WARNING_THRESHOLD_MS,
    criticalMs: DEFAULT_CRITICAL_THRESHOLD_MS,
  };

  constructor(private readonly eventEmitter: EventEmitter2) {}

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  /**
   * Register a new transfer for timeout tracking.
   * Call this as soon as a Stellar bridge transfer is initiated.
   */
  register(transfer: Omit<TrackedTransfer, 'state' | 'registeredAt' | 'lastUpdatedAt'>): TrackedTransfer {
    const now = new Date();
    const tracked: TrackedTransfer = {
      ...transfer,
      state: TransferState.PENDING,
      registeredAt: now,
      lastUpdatedAt: now,
    };

    this.active.set(transfer.transferId, tracked);
    this.logger.debug(`Registered transfer ${transfer.transferId} for timeout tracking`);
    return tracked;
  }

  /**
   * Advance a transfer to IN_PROGRESS state.
   */
  markInProgress(transferId: string): TrackedTransfer | null {
    return this.updateState(transferId, TransferState.IN_PROGRESS);
  }

  /**
   * Mark a transfer as completed and remove it from active tracking.
   */
  markCompleted(transferId: string): TrackedTransfer | null {
    const transfer = this.updateState(transferId, TransferState.COMPLETED);
    if (transfer) {
      this.archive(transfer);
      this.eventEmitter.emit(TRANSFER_COMPLETED_EVENT, transfer);
    }
    return transfer;
  }

  /**
   * Mark a transfer as failed and remove it from active tracking.
   */
  markFailed(transferId: string, reason?: string): TrackedTransfer | null {
    const transfer = this.updateState(transferId, TransferState.FAILED);
    if (transfer) {
      if (reason) transfer.metadata = { ...transfer.metadata, failureReason: reason };
      this.archive(transfer);
    }
    return transfer;
  }

  /**
   * Check the current status of a single tracked transfer.
   */
  checkTransfer(transferId: string): TransferStatusCheck | null {
    const transfer = this.active.get(transferId);
    if (!transfer) return null;

    const elapsedMs = Date.now() - transfer.registeredAt.getTime();
    return this.buildStatusCheck(transfer, elapsedMs);
  }

  /**
   * Scan all active transfers for timeout conditions.
   * Called by the scheduler; also callable on-demand.
   */
  scan(): TimeoutScanSummary {
    const now = Date.now();
    const events: TimeoutEvent[] = [];
    let timedOutCount = 0;
    let warningCount = 0;
    let completedCount = 0;

    for (const transfer of this.active.values()) {
      // Skip already-resolved states that haven't been archived yet
      if (
        transfer.state === TransferState.COMPLETED ||
        transfer.state === TransferState.FAILED
      ) {
        completedCount++;
        continue;
      }

      const elapsedMs = now - transfer.registeredAt.getTime();

      if (elapsedMs >= this.thresholds.criticalMs) {
        // Escalate to timed-out
        transfer.state = TransferState.TIMED_OUT;
        transfer.lastUpdatedAt = new Date();

        const event: TimeoutEvent = {
          transferId: transfer.transferId,
          severity: TimeoutSeverity.CRITICAL,
          elapsedMs,
          thresholdMs: this.thresholds.criticalMs,
          detectedAt: new Date(),
          transfer: { ...transfer },
        };

        events.push(event);
        timedOutCount++;

        this.logger.warn(
          `TIMEOUT [CRITICAL] transfer=${transfer.transferId} elapsed=${Math.round(elapsedMs / 1000)}s asset=${transfer.asset} amount=${transfer.amount}`,
        );

        this.eventEmitter.emit(TIMEOUT_DETECTED_EVENT, event);
        this.archive(transfer);

      } else if (elapsedMs >= this.thresholds.warningMs) {
        const event: TimeoutEvent = {
          transferId: transfer.transferId,
          severity: TimeoutSeverity.WARNING,
          elapsedMs,
          thresholdMs: this.thresholds.warningMs,
          detectedAt: new Date(),
          transfer: { ...transfer },
        };

        events.push(event);
        warningCount++;

        this.logger.warn(
          `TIMEOUT [WARNING] transfer=${transfer.transferId} elapsed=${Math.round(elapsedMs / 1000)}s asset=${transfer.asset}`,
        );

        this.eventEmitter.emit(TIMEOUT_DETECTED_EVENT, event);
      }
    }

    const summary: TimeoutScanSummary = {
      scannedAt: new Date(),
      totalTracked: this.active.size,
      timedOut: timedOutCount,
      warnings: warningCount,
      completed: completedCount,
      events,
    };

    if (timedOutCount > 0 || warningCount > 0) {
      this.logger.log(
        `Scan complete | active=${this.active.size} timedOut=${timedOutCount} warnings=${warningCount}`,
      );
    }

    return summary;
  }

  /**
   * Get all currently active (non-resolved) transfers.
   */
  getActiveTransfers(): TrackedTransfer[] {
    return Array.from(this.active.values());
  }

  /**
   * Get resolved transfer history (completed, failed, timed-out).
   */
  getHistory(limit = 50): TrackedTransfer[] {
    return this.resolved.slice(-limit);
  }

  /**
   * Override default timeout thresholds.
   */
  setThresholds(thresholds: Partial<TimeoutThresholds>): void {
    this.thresholds = { ...this.thresholds, ...thresholds };
    this.logger.log(
      `Thresholds updated: warning=${this.thresholds.warningMs}ms critical=${this.thresholds.criticalMs}ms`,
    );
  }

  getThresholds(): TimeoutThresholds {
    return { ...this.thresholds };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private updateState(transferId: string, state: TransferState): TrackedTransfer | null {
    const transfer = this.active.get(transferId);
    if (!transfer) {
      this.logger.debug(`Transfer ${transferId} not found in active tracking`);
      return null;
    }
    transfer.state = state;
    transfer.lastUpdatedAt = new Date();
    return transfer;
  }

  private archive(transfer: TrackedTransfer): void {
    this.active.delete(transfer.transferId);
    this.resolved.push({ ...transfer });

    // Trim history to avoid unbounded memory growth
    if (this.resolved.length > MAX_RESOLVED_HISTORY) {
      this.resolved.splice(0, this.resolved.length - MAX_RESOLVED_HISTORY);
    }
  }

  private buildStatusCheck(transfer: TrackedTransfer, elapsedMs: number): TransferStatusCheck {
    return {
      transferId: transfer.transferId,
      state: transfer.state,
      elapsedMs,
      isTimedOut: elapsedMs >= this.thresholds.criticalMs,
      isWarning: elapsedMs >= this.thresholds.warningMs && elapsedMs < this.thresholds.criticalMs,
      checkedAt: new Date(),
    };
  }
}
