import type {
  IBridgeAdapter,
  ISorobanBridgeAdapter,
  AdapterTransferRequest,
  AdapterTransferOptions,
  AdapterTransferResult,
  AdapterTransferStatusResult,
  AdapterFeeEstimate,
  AdapterNetworkStats,
  AdapterInfo,
} from './SorobanBridgeAdapter';

// ─── Minimal stub implementations used in structural tests ───────────────────

class StubBridgeAdapter implements IBridgeAdapter {
  private connected = false;

  async connect(_network: 'mainnet' | 'testnet'): Promise<void> {
    this.connected = true;
  }

  disconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async executeTransfer(
    _transfer: AdapterTransferRequest,
    _options?: AdapterTransferOptions,
  ): Promise<AdapterTransferResult> {
    return {
      success: true,
      transactionHash: 'abc123',
      operationId: 'op-1',
      bridgedAmount: '1000',
      estimatedTimeMs: 5000,
    };
  }

  async estimateFees(
    _transfer: AdapterTransferRequest,
  ): Promise<AdapterFeeEstimate> {
    return {
      networkFee: '100',
      bridgeFee: '10',
      totalFee: '110',
      feePercentage: '0.1',
      gasEstimate: '300000',
    };
  }

  async getTransferStatus(
    operationId: string,
  ): Promise<AdapterTransferStatusResult> {
    return {
      operationId,
      status: 'confirmed',
      transactionHash: 'abc123',
      bridgedAmount: '1000',
      estimatedTimeMs: 0,
    };
  }
}

class StubSorobanAdapter
  extends StubBridgeAdapter
  implements ISorobanBridgeAdapter
{
  async getNetworkStats(): Promise<AdapterNetworkStats> {
    return { baseFee: 100, averageTimeMs: 5000, pendingTransactions: 3 };
  }

  getAdapterInfo(): AdapterInfo {
    return {
      name: 'StubSorobanAdapter',
      version: '0.1.0',
      network: 'testnet',
      supportedSourceChains: ['stellar', 'stellar-testnet'],
      supportedDestinationChains: ['ethereum', 'polygon'],
    };
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('IBridgeAdapter', () => {
  let adapter: IBridgeAdapter;

  beforeEach(() => {
    adapter = new StubBridgeAdapter();
  });

  it('starts disconnected', () => {
    expect(adapter.isConnected()).toBe(false);
  });

  it('reports connected after connect()', async () => {
    await adapter.connect('testnet');
    expect(adapter.isConnected()).toBe(true);
  });

  it('reports disconnected after disconnect()', async () => {
    await adapter.connect('testnet');
    adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('executeTransfer returns a result with success flag', async () => {
    const result = await adapter.executeTransfer({
      sourceChain: 'stellar',
      targetChain: 'ethereum',
      sourceAmount: '1000',
      recipient: '0xRecipient',
    });
    expect(result.success).toBe(true);
    expect(result.transactionHash).toBeDefined();
  });

  it('estimateFees returns networkFee, bridgeFee and totalFee', async () => {
    const estimate = await adapter.estimateFees({
      sourceChain: 'stellar',
      targetChain: 'polygon',
      sourceAmount: '500',
      recipient: '0xRecipient',
    });
    expect(estimate.networkFee).toBeDefined();
    expect(estimate.bridgeFee).toBeDefined();
    expect(estimate.totalFee).toBeDefined();
  });

  it('getTransferStatus returns status for the given operationId', async () => {
    const statusResult = await adapter.getTransferStatus('op-42');
    expect(statusResult.operationId).toBe('op-42');
    expect(['pending', 'confirmed', 'failed']).toContain(statusResult.status);
  });
});

describe('ISorobanBridgeAdapter', () => {
  let adapter: ISorobanBridgeAdapter;

  beforeEach(() => {
    adapter = new StubSorobanAdapter();
  });

  it('satisfies IBridgeAdapter contract', async () => {
    await adapter.connect('mainnet');
    expect(adapter.isConnected()).toBe(true);
    adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
  });

  it('getNetworkStats returns baseFee and averageTimeMs', async () => {
    const stats = await adapter.getNetworkStats();
    expect(typeof stats.baseFee).toBe('number');
    expect(typeof stats.averageTimeMs).toBe('number');
    expect(typeof stats.pendingTransactions).toBe('number');
  });

  it('getAdapterInfo returns name, version, and supported chains', () => {
    const info = adapter.getAdapterInfo();
    expect(info.name).toBeTruthy();
    expect(info.version).toBeTruthy();
    expect(['mainnet', 'testnet']).toContain(info.network);
    expect(Array.isArray(info.supportedSourceChains)).toBe(true);
    expect(Array.isArray(info.supportedDestinationChains)).toBe(true);
  });
});
