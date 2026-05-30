export interface FinalityCheckResult {
  transactionHash: string;
  ledger: number;
  currentLedger: number;
  confirmations: number;
  isFinalized: boolean;
  checkedAt: Date;
}

export interface FinalityConfig {
  requiredConfirmations: number;
  horizonUrl: string;
}

const DEFAULT_CONFIG: FinalityConfig = {
  requiredConfirmations: 1,
  horizonUrl: 'https://horizon-testnet.stellar.org',
};

export class StellarFinalityChecker {
  private readonly config: FinalityConfig;

  constructor(config: Partial<FinalityConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Fetches the current ledger sequence from Horizon.
   */
  async getCurrentLedger(): Promise<number> {
    const res = await fetch(this.config.horizonUrl);
    if (!res.ok) throw new Error(`Horizon request failed: ${res.status}`);
    const data = (await res.json()) as { core_latest_ledger: number };
    return data.core_latest_ledger;
  }

  /**
   * Fetches the ledger in which a transaction was included.
   */
  async getTransactionLedger(txHash: string): Promise<number> {
    const url = `${this.config.horizonUrl}/transactions/${txHash}`;
    const res = await fetch(url);
    if (!res.ok)
      throw new Error(`Transaction not found: ${txHash} (${res.status})`);
    const data = (await res.json()) as { ledger: number };
    return data.ledger;
  }

  /**
   * Checks whether a Stellar transaction has reached finality.
   */
  async checkFinality(txHash: string): Promise<FinalityCheckResult> {
    const [txLedger, currentLedger] = await Promise.all([
      this.getTransactionLedger(txHash),
      this.getCurrentLedger(),
    ]);

    const confirmations = Math.max(0, currentLedger - txLedger);
    return {
      transactionHash: txHash,
      ledger: txLedger,
      currentLedger,
      confirmations,
      isFinalized: confirmations >= this.config.requiredConfirmations,
      checkedAt: new Date(),
    };
  }
}
