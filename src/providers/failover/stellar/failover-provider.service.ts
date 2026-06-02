export interface BridgeProvider {
  name: string;
  url: string;
  priority: number;
}

export interface FailoverResult {
  provider: BridgeProvider;
  failedProviders: string[];
}

export class StellarBridgeFailoverProvider {
  private readonly providers: BridgeProvider[];
  private readonly failedSet = new Set<string>();
  private readonly timeoutMs: number;

  constructor(providers: BridgeProvider[], timeoutMs = 5000) {
    this.providers = [...providers].sort((a, b) => a.priority - b.priority);
    this.timeoutMs = timeoutMs;
  }

  /**
   * Returns the first healthy provider, detecting failures and switching to backups.
   */
  async getActiveProvider(): Promise<FailoverResult> {
    const failedProviders: string[] = [];

    for (const provider of this.providers) {
      if (this.failedSet.has(provider.name)) {
        failedProviders.push(provider.name);
        continue;
      }
      const healthy = await this.isHealthy(provider);
      if (healthy) return { provider, failedProviders };
      this.failedSet.add(provider.name);
      failedProviders.push(provider.name);
    }

    throw new Error(`All bridge providers unavailable: ${failedProviders.join(', ')}`);
  }

  /** Marks a provider as recovered so it can be retried. */
  recover(providerName: string): void {
    this.failedSet.delete(providerName);
  }

  private async isHealthy(provider: BridgeProvider): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), this.timeoutMs);
      const res = await fetch(provider.url, { signal: controller.signal });
      clearTimeout(id);
      return res.ok;
    } catch {
      return false;
    }
  }
}
