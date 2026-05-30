import { Injectable, Logger } from '@nestjs/common';
import { Horizon } from '@stellar/stellar-sdk';
import { LedgerSyncStatus } from './ledger-sync.types';

@Injectable()
export class StellarLedgerSyncMonitor {
  private readonly logger = new Logger(
    StellarLedgerSyncMonitor.name,
  );

  private readonly MAX_ALLOWED_LAG = 5;

  constructor(
    private readonly horizonServer: Horizon.Server,
  ) {}

  async checkSyncStatus(): Promise<LedgerSyncStatus> {
    try {
      const latestLedgerResponse =
        await this.horizonServer.ledgers().order('desc').limit(1).call();

      const latestLedger =
        Number(latestLedgerResponse.records[0]?.sequence);

      const root = await this.horizonServer.root();

      const currentLedger = Number(
        root.history_latest_ledger,
      );

      const lag = latestLedger - currentLedger;

      const status: LedgerSyncStatus = {
        currentLedger,
        latestLedger,
        lag,
        isSynced: lag <= this.MAX_ALLOWED_LAG,
        checkedAt: new Date(),
      };

      if (!status.isSynced) {
        this.logger.warn(
          `Stellar node out of sync. Lag: ${lag} ledgers`,
        );
      }

      return status;
    } catch (error) {
      this.logger.error(
        'Failed to check Stellar ledger sync',
        error,
      );

      throw error;
    }
  }
}