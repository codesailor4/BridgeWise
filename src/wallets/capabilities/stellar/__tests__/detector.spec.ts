import { detectSorobanWalletCapabilities } from '../detector';
import type { WalletAdapter, WalletAccount } from '../../../../packages/wallet/src';

class MockAdapter implements WalletAdapter {
  readonly id = 'mock-wallet';
  readonly name = 'Mock Wallet';
  readonly type = 'freighter' as const;
  readonly networkType = 'stellar' as const;
  readonly isAvailable = true;
  readonly icon = undefined;
  readonly supportedChains = [] as any;

  private account: WalletAccount | null = null;

  async connect(): Promise<WalletAccount> {
    this.account = { address: 'GABC', publicKey: 'GABC', chainId: 'stellar:public', network: 'stellar' };
    return this.account;
  }
  async disconnect(): Promise<void> {
    this.account = null;
  }
  async getAccount(): Promise<WalletAccount | null> {
    return this.account;
  }
  async getBalance(): Promise<any> {
    return {};
  }
  async getAllBalances(): Promise<any[]> {
    return [];
  }
  async switchNetwork(): Promise<void> {}
  async sign(): Promise<string> {
    return 'signed';
  }
  async sendTransaction(): Promise<string> {
    return 'txhash';
  }
  on(): void {}
  off(): void {}
}

describe('detectSorobanWalletCapabilities', () => {
  it('detects capabilities for a connected adapter', async () => {
    const adapter = new MockAdapter();
    await adapter.connect();

    const caps = await detectSorobanWalletCapabilities(adapter as unknown as WalletAdapter);

    expect(caps.walletId).toBe('mock-wallet');
    expect(caps.supports.signTransaction).toBe(true);
    expect(caps.supports.signData).toBe(true);
    expect(caps.supports.isConnected).toBe(true);
  });

  it('handles disconnected adapter safely', async () => {
    const adapter = new MockAdapter();
    const caps = await detectSorobanWalletCapabilities(adapter as unknown as WalletAdapter);

    expect(caps.supports.isConnected).toBe(false);
  });
});
