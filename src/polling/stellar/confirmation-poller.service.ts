export interface ConfirmationStatus {
  transactionHash: string;
  confirmed: boolean;
  ledger: number | null;
  confirmations: number;
  checkedAt: Date;
}

export interface PollerConfig {
  horizonUrl: string;
  intervalMs: number;
  requiredConfirmations: number;
}

const DEFAULT_CONFIG: PollerConfig = {
  horizonUrl: 'https://horizon-testnet.stellar.org',
  intervalMs: 5000,
  requiredConfirmations: 1,
};

type StatusCallback = (status: ConfirmationStatus) => void;

export class StellarTransferConfirmationPoller {
  private readonly config: PollerConfig;
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  constructor(config: Partial<PollerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Starts polling for a transaction until confirmed, then calls onConfirmed.
   */
  poll(txHash: string, onUpdate: StatusCallback): void {
    if (this.timers.has(txHash)) return;

    const timer = setInterval(async () => {
      const status = await this.check(txHash);
      onUpdate(status);
      if (status.confirmed) this.stop(txHash);
    }, this.config.intervalMs);

    this.timers.set(txHash, timer);
  }

  stop(txHash: string): void {
    const t = this.timers.get(txHash);
    if (t) { clearInterval(t); this.timers.delete(txHash); }
  }

  stopAll(): void {
    for (const txHash of this.timers.keys()) this.stop(txHash);
  }

  async check(txHash: string): Promise<ConfirmationStatus> {
    try {
      const [txRes, rootRes] = await Promise.all([
        fetch(`${this.config.horizonUrl}/transactions/${txHash}`),
        fetch(this.config.horizonUrl),
      ]);

      if (!txRes.ok) {
        return { transactionHash: txHash, confirmed: false, ledger: null, confirmations: 0, checkedAt: new Date() };
      }

      const tx = (await txRes.json()) as { ledger: number };
      const root = (await rootRes.json()) as { core_latest_ledger: number };
      const confirmations = Math.max(0, root.core_latest_ledger - tx.ledger);

      return {
        transactionHash: txHash,
        confirmed: confirmations >= this.config.requiredConfirmations,
        ledger: tx.ledger,
        confirmations,
        checkedAt: new Date(),
      };
    } catch {
      return { transactionHash: txHash, confirmed: false, ledger: null, confirmations: 0, checkedAt: new Date() };
    }
  }
}
