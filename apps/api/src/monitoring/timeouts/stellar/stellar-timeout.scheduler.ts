/**
 * Stellar Timeout Scheduler
 *
 * Runs the timeout scan on a fixed cron interval.
 * Mirrors the pattern used by LedgerSyncScheduler.
 */

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StellarTimeoutMonitor } from './stellar-timeout.monitor';
import { SCAN_INTERVAL_CRON } from './stellar-timeout.constants';

@Injectable()
export class StellarTimeoutScheduler {
  private readonly logger = new Logger(StellarTimeoutScheduler.name);

  constructor(private readonly monitor: StellarTimeoutMonitor) {}

  @Cron(SCAN_INTERVAL_CRON)
  async runScan(): Promise<void> {
    const summary = this.monitor.scan();

    this.logger.log(
      `Timeout Scan | tracked=${summary.totalTracked} timedOut=${summary.timedOut} warnings=${summary.warnings}`,
    );
  }
}
