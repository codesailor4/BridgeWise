import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter } from 'events';
import axios from 'axios';

export type RollbackStatus = 'confirmed' | 'reverted' | 'pending';

export interface SorobanTransfer {
  txHash: string;
  contractId: string;
  fromAccount: string;
  toAccount: string;
  amount: string;
  asset: string;
  ledgerSequence: number;
  timestamp: number;
}

export interface RollbackEvent {
  transfer: SorobanTransfer;
  reason: string;
  detectedAt: Date;
  previousStatus: RollbackStatus;
}

export interface RollbackDetectorConfig {
  sorobanRpcUrl: string;
  checkIntervalMs?: number;
  timeoutMs?: number;
}

@Injectable()
export class SorobanRollbackDetector extends EventEmitter {
  private readonly logger = new Logger(SorobanRollbackDetector.name);
  private readonly config: Required<RollbackDetectorConfig>;
  private readonly trackedTransfers = new Map<string, { transfer: SorobanTransfer; status: RollbackStatus }>();
  private checkInterval: NodeJS.Timeout | null = null;

  constructor(config: RollbackDetectorConfig) {
    super();
    this.config = {
      sorobanRpcUrl: config.sorobanRpcUrl,
      checkIntervalMs: config.checkIntervalMs ?? 15000,
      timeoutMs: config.timeoutMs ?? 5000,
    };
  }

  /**
   * Track a Soroban transfer for rollback detection
   */
  trackTransfer(transfer: SorobanTransfer): void {
    this.trackedTransfers.set(transfer.txHash, { transfer, status: 'pending' });
    this.logger.log(`Tracking transfer ${transfer.txHash} for rollback detection`);
  }

  /**
   * Untrack a transfer
   */
  untrackTransfer(txHash: string): boolean {
    return this.trackedTransfers.delete(txHash);
  }

  /**
   * Get current status of a tracked transfer
   */
  getTransferStatus(txHash: string): RollbackStatus | undefined {
    return this.trackedTransfers.get(txHash)?.status;
  }

  /**
   * Check a single transaction for rollback/revert
   */
  async checkTransaction(txHash: string): Promise<RollbackStatus> {
    const entry = this.trackedTransfers.get(txHash);
    if (!entry) {
      throw new Error(`Transfer not tracked: ${txHash}`);
    }

    try {
      const response = await axios.post(
        this.config.sorobanRpcUrl,
        { jsonrpc: '2.0', id: 1, method: 'getTransaction', params: { hash: txHash } },
        { timeout: this.config.timeoutMs, headers: { 'Content-Type': 'application/json' } },
      );

      const result = response.data?.result;
      if (!result) {
        return entry.status;
      }

      const prevStatus = entry.status;
      let nextStatus: RollbackStatus = entry.status;
      let rollbackReason: string | undefined;

      if (result.status === 'SUCCESS') {
        nextStatus = 'confirmed';
      } else if (result.status === 'FAILED' || result.status === 'NOT_FOUND') {
        nextStatus = 'reverted';
        rollbackReason = result.status === 'NOT_FOUND'
          ? 'Transaction not found on ledger (possible rollback)'
          : `Transaction failed: ${result.resultXdr ?? 'unknown reason'}`;
      }

      entry.status = nextStatus;

      if (prevStatus !== nextStatus && nextStatus === 'reverted') {
        const event: RollbackEvent = {
          transfer: entry.transfer,
          reason: rollbackReason ?? 'Unknown',
          detectedAt: new Date(),
          previousStatus: prevStatus,
        };
        this.logger.warn(`Rollback detected for tx ${txHash}: ${rollbackReason}`);
        this.emit('rollback', event);
        this.emit('status-change', event);
      } else if (prevStatus !== nextStatus && nextStatus === 'confirmed') {
        this.logger.log(`Transfer ${txHash} confirmed on ledger`);
        this.emit('confirmed', { transfer: entry.transfer, detectedAt: new Date() });
      }

      return nextStatus;
    } catch (error) {
      this.logger.error(`Failed to check transaction ${txHash}: ${error.message}`);
      return entry.status;
    }
  }

  /**
   * Check all tracked pending transfers
   */
  async checkAll(): Promise<Map<string, RollbackStatus>> {
    const results = new Map<string, RollbackStatus>();
    for (const [txHash, entry] of this.trackedTransfers) {
      if (entry.status === 'pending') {
        const status = await this.checkTransaction(txHash);
        results.set(txHash, status);
      }
    }
    return results;
  }

  /**
   * Start background rollback monitoring
   */
  startMonitoring(): void {
    if (this.checkInterval) return;
    this.logger.log(`Starting Soroban rollback monitoring (interval: ${this.config.checkIntervalMs}ms)`);
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkAll();
      } catch (error) {
        this.logger.error(`Rollback check error: ${error.message}`);
      }
    }, this.config.checkIntervalMs);
  }

  /**
   * Stop background monitoring
   */
  stopMonitoring(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      this.logger.log('Stopped Soroban rollback monitoring');
    }
  }
}
