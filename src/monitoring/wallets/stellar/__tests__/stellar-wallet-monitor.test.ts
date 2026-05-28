/* eslint-disable @typescript-eslint/unbound-method */
import { EventEmitter } from 'events';
import { StellarWalletMonitor } from '../stellar-wallet-monitor';
import { stellarMetrics } from '../../../../exporters/metrics/stellar';

// Mock the metrics exporter
jest.mock('../../../../exporters/metrics/stellar', () => {
  return {
    stellarMetrics: {
      recordWalletConnection: jest.fn(),
      recordWalletConnectionFailure: jest.fn(),
      recordWalletDisconnect: jest.fn(),
      setWalletActiveConnections: jest.fn(),
      setWalletHealth: jest.fn(),
      recordWalletPingLatency: jest.fn(),
    },
  };
});

// Create Mock classes for the Wallet SDK
class MockWalletAdapter extends EventEmitter {
  public id: string;
  public name: string;
  public networkType: string;
  public provider: any;
  public getAccountMock: jest.Mock;
  public getHorizonUrlMock: jest.Mock;

  constructor(id: string, name: string, networkType: string = 'stellar') {
    super();
    this.id = id;
    this.name = name;
    this.networkType = networkType;
    this.getAccountMock = jest.fn();
    this.getHorizonUrlMock = jest.fn();
  }

  getAccount() {
    return this.getAccountMock();
  }

  getHorizonUrl() {
    return this.getHorizonUrlMock();
  }
}

class MockWalletManager extends EventEmitter {
  private adapters: Map<string, any> = new Map();

  registerAdapter(adapter: any) {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: string) {
    return this.adapters.get(id) || null;
  }

  getAllAdapters() {
    return Array.from(this.adapters.values());
  }

  getStellarWallets() {
    return this.getAllAdapters().filter((a) => a.networkType === 'stellar');
  }
}

describe('StellarWalletMonitor', () => {
  let manager: MockWalletManager;
  let adapter: MockWalletAdapter;
  let provider: any;
  let originalFetch: typeof fetch;
  let mockFetch: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    manager = new MockWalletManager();
    adapter = new MockWalletAdapter('freighter', 'Freighter');
    provider = {
      isConnected: jest.fn().mockReturnValue(true),
      publicKey: jest.fn().mockResolvedValue('GB1234567890'),
    };
    adapter.provider = provider;
    manager.registerAdapter(adapter);

    // Mock fetch
    originalFetch = global.fetch;
    mockFetch = jest.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.useRealTimers();
  });

  it('should initialize with config default values', () => {
    const monitor = new StellarWalletMonitor(manager as any);
    expect(monitor.getAllHealthReports()).toHaveLength(0);
  });

  it('should start and subscribe to manager events and perform initial check', async () => {
    const monitor = new StellarWalletMonitor(manager as any);
    const checkAllSpy = jest
      .spyOn(monitor, 'checkAll')
      .mockResolvedValue(undefined);

    monitor.start();

    expect(manager.listenerCount('connect')).toBe(1);
    expect(manager.listenerCount('disconnect')).toBe(1);
    expect(checkAllSpy).toHaveBeenCalledTimes(1);

    monitor.stop();

    expect(manager.listenerCount('connect')).toBe(0);
    expect(manager.listenerCount('disconnect')).toBe(0);
  });

  it('should run periodic checks on interval', async () => {
    const monitor = new StellarWalletMonitor(manager as any, {
      checkIntervalMs: 5000,
    });
    const checkAllSpy = jest
      .spyOn(monitor, 'checkAll')
      .mockResolvedValue(undefined);

    monitor.start();
    expect(checkAllSpy).toHaveBeenCalledTimes(1);

    // Fast-forward time
    jest.advanceTimersByTime(5000);
    expect(checkAllSpy).toHaveBeenCalledTimes(2);

    jest.advanceTimersByTime(5000);
    expect(checkAllSpy).toHaveBeenCalledTimes(3);

    monitor.stop();
  });

  it('should report disconnected when getAccount returns null', async () => {
    adapter.getAccountMock.mockResolvedValue(null);

    const monitor = new StellarWalletMonitor(manager as any);
    const report = await monitor.checkWallet(adapter as any);

    expect(report.status).toBe('disconnected');
    expect(report.address).toBeNull();
    expect(report.providerConnected).toBe(false);
    expect(report.horizonConnected).toBe(false);
  });

  it('should report healthy when provider and Horizon check passes', async () => {
    adapter.getAccountMock.mockResolvedValue({
      address: 'GB1234567890',
      chainId: 'stellar:testnet',
    });
    adapter.getHorizonUrlMock.mockReturnValue(
      'https://horizon-testnet.stellar.org',
    );

    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    });

    const monitor = new StellarWalletMonitor(manager as any);
    const report = await monitor.checkWallet(adapter as any);

    expect(report.status).toBe('healthy');
    expect(report.address).toBe('GB1234567890');
    expect(report.providerConnected).toBe(true);
    expect(report.horizonConnected).toBe(true);
    expect(report.error).toBeUndefined();

    expect(stellarMetrics.setWalletHealth).toHaveBeenCalledWith(
      'freighter',
      'GB1234567890',
      1,
    );
    expect(stellarMetrics.recordWalletPingLatency).toHaveBeenCalledWith(
      'freighter',
      expect.any(Number),
    );
  });

  it('should report unhealthy when provider.isConnected returns false', async () => {
    adapter.getAccountMock.mockResolvedValue({
      address: 'GB1234567890',
      chainId: 'stellar:testnet',
    });
    provider.isConnected.mockReturnValue(false);
    mockFetch.mockResolvedValue({ ok: true });

    const monitor = new StellarWalletMonitor(manager as any);
    const report = await monitor.checkWallet(adapter as any);

    expect(report.status).toBe('unhealthy');
    expect(report.providerConnected).toBe(false);
    expect(report.error).toContain('Provider isConnected() returned false');
    expect(stellarMetrics.setWalletHealth).toHaveBeenCalledWith(
      'freighter',
      'GB1234567890',
      0,
    );
  });

  it('should report unhealthy when provider ping times out', async () => {
    jest.useRealTimers();
    adapter.getAccountMock.mockResolvedValue({
      address: 'GB1234567890',
      chainId: 'stellar:testnet',
    });

    // Make provider query never resolve
    provider.publicKey.mockReturnValue(new Promise(() => {}));
    mockFetch.mockResolvedValue({ ok: true });

    const monitor = new StellarWalletMonitor(manager as any, {
      pingTimeoutMs: 10,
    });

    const report = await monitor.checkWallet(adapter as any);

    expect(report.status).toBe('unhealthy');
    expect(report.providerConnected).toBe(false);
    expect(report.error).toContain('publicKey() query timed out');
    expect(stellarMetrics.setWalletHealth).toHaveBeenCalledWith(
      'freighter',
      'GB1234567890',
      0,
    );
  });

  it('should report unhealthy when Horizon fetch fails', async () => {
    adapter.getAccountMock.mockResolvedValue({
      address: 'GB1234567890',
      chainId: 'stellar:testnet',
    });
    mockFetch.mockRejectedValue(new Error('Network failure'));

    const monitor = new StellarWalletMonitor(manager as any);
    const report = await monitor.checkWallet(adapter as any);

    expect(report.status).toBe('unhealthy');
    expect(report.providerConnected).toBe(true);
    expect(report.horizonConnected).toBe(false);
    expect(report.error).toContain(
      'Horizon reachability error: Network failure',
    );
    expect(stellarMetrics.setWalletHealth).toHaveBeenCalledWith(
      'freighter',
      'GB1234567890',
      0,
    );
  });

  it('should handle connect events from WalletManager', async () => {
    const monitor = new StellarWalletMonitor(manager as any);
    monitor.start();

    adapter.getAccountMock.mockResolvedValue({
      address: 'GB1234567890',
      chainId: 'stellar:testnet',
    });
    mockFetch.mockResolvedValue({ ok: true });

    manager.emit('connect', {
      walletId: 'freighter',
      account: { address: 'GB1234567890' },
    });

    // Wait for async events
    await Promise.resolve();

    expect(stellarMetrics.recordWalletConnection).toHaveBeenCalledWith(
      'freighter',
    );

    monitor.stop();
  });

  it('should handle disconnect events from WalletManager', async () => {
    const monitor = new StellarWalletMonitor(manager as any);
    monitor.start();

    // Setup initial report state as healthy
    adapter.getAccountMock.mockResolvedValue({
      address: 'GB1234567890',
      chainId: 'stellar:testnet',
    });
    mockFetch.mockResolvedValue({ ok: true });
    await monitor.checkWallet(adapter as any);

    manager.emit('disconnect', { walletId: 'freighter' });

    expect(stellarMetrics.recordWalletDisconnect).toHaveBeenCalledWith(
      'freighter',
      'user_disconnected',
    );
    expect(stellarMetrics.setWalletHealth).toHaveBeenCalledWith(
      'freighter',
      'GB1234567890',
      0,
    );

    const report = monitor.getHealthReport('freighter');
    expect(report?.status).toBe('disconnected');

    monitor.stop();
  });

  it('should trigger callback listener when health changes', async () => {
    adapter.getAccountMock.mockResolvedValue({
      address: 'GB1234567890',
      chainId: 'stellar:testnet',
    });
    mockFetch.mockResolvedValue({ ok: true });

    const monitor = new StellarWalletMonitor(manager as any);
    const callback = jest.fn();
    monitor.onHealthChanged(callback);

    // Initial check (healthy)
    await monitor.checkWallet(adapter as any);
    expect(callback).toHaveBeenCalledTimes(1);
    expect(callback.mock.calls[0][0].status).toBe('healthy');

    // Make unhealthy
    provider.isConnected.mockReturnValue(false);
    await monitor.checkWallet(adapter as any);
    expect(callback).toHaveBeenCalledTimes(2);
    expect(callback.mock.calls[1][0].status).toBe('unhealthy');

    // Remove listener and check again - shouldn't trigger
    monitor.offHealthChanged(callback);
    await monitor.checkWallet(adapter as any);
    expect(callback).toHaveBeenCalledTimes(2);
  });
});
