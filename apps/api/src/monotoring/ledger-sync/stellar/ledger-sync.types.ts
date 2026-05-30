export interface LedgerSyncStatus {
  currentLedger: number;
  latestLedger: number;
  lag: number;
  isSynced: boolean;
  checkedAt: Date;
}