import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StellarLedgerSyncMonitor } from './stellar-ledger-sync.monitor';

@Injectable()
export class LedgerSyncScheduler {
  private readonly logger = new Logger(
    LedgerSyncScheduler.name,
  );

  constructor(
    private readonly monitor: StellarLedgerSyncMonitor,
  ) {}

  @Cron('*/30 * * * * *')
  async monitorLedgerSync() {
    const status = await this.monitor.checkSyncStatus();

    this.logger.log(
      `Ledger Sync Check | Current=${status.currentLedger} | Latest=${status.latestLedger} | Lag=${status.lag}`,
    );
  }
}