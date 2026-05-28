import type {
  WalletManager,
  WalletAdapter,
  WalletAccount,
} from '../../../../packages/wallet/src';
import { stellarMetrics } from '../../../exporters/metrics/stellar';

export interface WalletMonitorConfig {
  /** Polling interval for heartbeat checks in milliseconds. Default is 15000 (15 seconds). */
  checkIntervalMs?: number;
  /** Timeout for pings to the Stellar provider / Horizon in milliseconds. Default is 5000 (5 seconds). */
  pingTimeoutMs?: number;
  /** Custom Horizon URLs to ping for network checks. If not provided, falls back to the adapter's URL. */
  horizonUrls?: Record<string, string>;
}

export type WalletHealthStatus = 'healthy' | 'unhealthy' | 'disconnected';

export interface WalletHealthReport {
  walletId: string;
  address: string | null;
  status: WalletHealthStatus;
  providerConnected: boolean;
  horizonConnected: boolean;
  pingLatencyMs?: number;
  lastChecked: Date;
  error?: string;
}

export type HealthChangedCallback = (report: WalletHealthReport) => void;

/**
 * StellarWalletMonitor
 * Monitors connectivity and health of connected Stellar wallets.
 * Detects disconnections and emits health metrics via StellarMetricsExporter.
 */
export class StellarWalletMonitor {
  private readonly manager: WalletManager;
  private readonly config: Required<WalletMonitorConfig>;
  private checkInterval: NodeJS.Timeout | null = null;
  private healthReports: Map<string, WalletHealthReport> = new Map();
  private listeners: Set<HealthChangedCallback> = new Set();

  constructor(manager: WalletManager, config: WalletMonitorConfig = {}) {
    this.manager = manager;
    this.config = {
      checkIntervalMs: config.checkIntervalMs ?? 15000,
      pingTimeoutMs: config.pingTimeoutMs ?? 5000,
      horizonUrls: config.horizonUrls ?? {},
    };
  }

  /**
   * Start monitoring Stellar wallets
   */
  start(): void {
    if (this.checkInterval) return;

    // Listen to Manager events for immediate state updates
    this.manager.on('connect', this.handleManagerConnect);
    this.manager.on('disconnect', this.handleManagerDisconnect);

    // Initial check
    void this.checkAll();

    // Start periodic polling
    this.checkInterval = setInterval(() => {
      void this.checkAll();
    }, this.config.checkIntervalMs);

    if (this.checkInterval.unref) {
      this.checkInterval.unref();
    }
  }

  /**
   * Stop monitoring Stellar wallets
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    this.manager.off('connect', this.handleManagerConnect);
    this.manager.off('disconnect', this.handleManagerDisconnect);
  }

  /**
   * Register a health changed listener
   */
  onHealthChanged(callback: HealthChangedCallback): void {
    this.listeners.add(callback);
  }

  /**
   * Unregister a health changed listener
   */
  offHealthChanged(callback: HealthChangedCallback): void {
    this.listeners.delete(callback);
  }

  /**
   * Get the current health report for a specific wallet
   */
  getHealthReport(walletId: string): WalletHealthReport | null {
    return this.healthReports.get(walletId) || null;
  }

  /**
   * Get all active health reports
   */
  getAllHealthReports(): WalletHealthReport[] {
    return Array.from(this.healthReports.values());
  }

  /**
   * Check all Stellar wallets
   */
  async checkAll(): Promise<void> {
    const stellarWallets = this.manager.getStellarWallets
      ? this.manager.getStellarWallets()
      : this.manager
          .getAllAdapters()
          .filter((a) => a.networkType === 'stellar');

    let activeCount = 0;

    for (const adapter of stellarWallets) {
      const report = await this.checkWallet(adapter);
      if (report.status === 'healthy') {
        activeCount++;
      }
    }

    // Emit the active connections gauge count
    stellarMetrics.setWalletActiveConnections('stellar', activeCount);
  }

  /**
   * Perform detailed health checks on a specific adapter
   */
  async checkWallet(adapter: WalletAdapter): Promise<WalletHealthReport> {
    const walletId = adapter.id;
    let account: WalletAccount | null = null;

    try {
      account = await adapter.getAccount();
    } catch {
      // Failed to retrieve account details
    }

    if (!account) {
      const report: WalletHealthReport = {
        walletId,
        address: null,
        status: 'disconnected',
        providerConnected: false,
        horizonConnected: false,
        lastChecked: new Date(),
      };
      this.updateReport(walletId, report);
      return report;
    }

    const address = account.address;
    const startTime = Date.now();
    let providerConnected = false;
    let horizonConnected = false;
    let errorMsg: string | undefined;

    // 1. Verify provider connection & responsiveness
    try {
      const provider = (adapter as any).provider;
      if (provider) {
        const isConnectedCheck =
          typeof provider.isConnected === 'function'
            ? provider.isConnected()
            : true;

        if (isConnectedCheck) {
          // Timeout provider query to verify responsiveness
          await this.withTimeout(
            provider.publicKey(),
            this.config.pingTimeoutMs,
            'Provider publicKey() query timed out',
          );
          providerConnected = true;
        } else {
          errorMsg = 'Provider isConnected() returned false';
        }
      } else {
        errorMsg = 'Provider not initialized on adapter';
      }
    } catch (err: any) {
      providerConnected = false;
      errorMsg = `Provider error: ${err.message || err}`;
    }

    // 2. Verify Horizon connectivity
    let horizonUrl = this.config.horizonUrls[account.chainId] || '';
    if (!horizonUrl && typeof (adapter as any).getHorizonUrl === 'function') {
      try {
        horizonUrl = (adapter as any).getHorizonUrl();
      } catch {
        // Ignore fallback failures
      }
    }
    if (!horizonUrl) {
      // Hardcoded defaults based on chain ID
      const chainId = account.chainId || 'stellar:public';
      if (chainId.includes('testnet')) {
        horizonUrl = 'https://horizon-testnet.stellar.org';
      } else if (chainId.includes('futurenet')) {
        horizonUrl = 'https://horizon-futurenet.stellar.org';
      } else {
        horizonUrl = 'https://horizon.stellar.org';
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        this.config.pingTimeoutMs,
      );

      const response = await fetch(horizonUrl, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        horizonConnected = true;
      } else {
        errorMsg = errorMsg || `Horizon returned status ${response.status}`;
      }
    } catch (err: any) {
      horizonConnected = false;
      errorMsg =
        errorMsg || `Horizon reachability error: ${err.message || err}`;
    }

    const endTime = Date.now();
    const latency = endTime - startTime;

    // Record ping latency
    if (providerConnected) {
      stellarMetrics.recordWalletPingLatency(walletId, latency);
    }

    // Determine final status
    let status: WalletHealthStatus = 'healthy';
    if (!providerConnected || !horizonConnected) {
      status = 'unhealthy';
      stellarMetrics.setWalletHealth(walletId, address, 0);
    } else {
      stellarMetrics.setWalletHealth(walletId, address, 1);
    }

    const report: WalletHealthReport = {
      walletId,
      address,
      status,
      providerConnected,
      horizonConnected,
      pingLatencyMs: providerConnected ? latency : undefined,
      lastChecked: new Date(),
      error: errorMsg,
    };

    this.updateReport(walletId, report);
    return report;
  }

  private handleManagerConnect = (data: any): void => {
    const { walletId } = data;
    const adapter = this.manager.getAdapter(walletId);
    if (adapter && adapter.networkType === 'stellar') {
      stellarMetrics.recordWalletConnection(walletId);
      void this.checkWallet(adapter);
    }
  };

  private handleManagerDisconnect = (data: any): void => {
    const { walletId } = data;
    const adapter = this.manager.getAdapter(walletId);
    if (adapter && adapter.networkType === 'stellar') {
      stellarMetrics.recordWalletDisconnect(walletId, 'user_disconnected');

      const previousReport = this.healthReports.get(walletId);
      const address = previousReport?.address || null;

      const report: WalletHealthReport = {
        walletId,
        address,
        status: 'disconnected',
        providerConnected: false,
        horizonConnected: false,
        lastChecked: new Date(),
      };

      this.updateReport(walletId, report);
      if (address) {
        stellarMetrics.setWalletHealth(walletId, address, 0);
      }
    }
  };

  private updateReport(walletId: string, report: WalletHealthReport): void {
    const previous = this.healthReports.get(walletId);
    this.healthReports.set(walletId, report);

    if (
      !previous ||
      previous.status !== report.status ||
      previous.error !== report.error
    ) {
      // Trigger listeners
      for (const listener of this.listeners) {
        try {
          listener(report);
        } catch (err) {
          console.error(`[StellarWalletMonitor] Error in listener:`, err);
        }
      }
    }
  }

  private withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    timeoutErrorMsg: string,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(timeoutErrorMsg));
      }, timeoutMs);

      promise
        .then((res) => {
          clearTimeout(timer);
          resolve(res);
        })
        .catch((err) => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}
