import { renderHook, act } from '@testing-library/react-hooks';
import { useWalletConnections } from '../useWalletConnections';
import type { WalletAdapter, WalletAccount, WalletTransaction } from '../types';

const storage: Record<string, string> = {};

const localStorageMock = {
  getItem: jest.fn((key: string) => storage[key] ?? null),
  setItem: jest.fn((key: string, value: string) => {
    storage[key] = value;
  }),
  removeItem: jest.fn((key: string) => {
    delete storage[key];
  }),
  clear: jest.fn(() => {
    Object.keys(storage).forEach((key) => delete storage[key]);
  }),
};

function createMockAdapter(overrides: Partial<WalletAdapter> = {}): WalletAdapter {
  const account: WalletAccount = {
    address: 'GTESTACCOUNT',
    publicKey: 'GTESTACCOUNT',
    chainId: 'stellar:public',
    network: 'stellar',
  };

  return {
    id: 'stellar',
    name: 'Stellar Wallet',
    type: 'stellar',
    networkType: 'stellar',
    supportedChains: ['stellar:public'],
    isAvailable: true,
    connect: jest.fn(async () => account),
    disconnect: jest.fn(async () => undefined),
    getAccount: jest.fn(async () => account),
    getBalance: jest.fn(async () => ({
      token: 'native',
      symbol: 'XLM',
      decimals: 7,
      balance: '10000000',
      balanceFormatted: '1 XLM',
    })),
    getAllBalances: jest.fn(async () => []),
    switchNetwork: jest.fn(async () => undefined),
    sign: jest.fn(async () => 'signed'),
    sendTransaction: jest.fn(async (_transaction: WalletTransaction) => 'tx-hash'),
    on: jest.fn(),
    off: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  localStorageMock.clear();
  jest.clearAllMocks();
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: localStorageMock },
    configurable: true,
  });
  Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
  });
});

describe('useWalletConnections', () => {
  it('should initialize with empty wallets', () => {
    const { result } = renderHook(() => useWalletConnections({ autoConnect: false, adapters: [] }));
    expect(result.current.wallets).toEqual([]);
    expect(result.current.activeAccount).toBeNull();
    expect(result.current.error).toBeNull();
  });

  it('persists wallet sessions after connecting', async () => {
    const adapter = createMockAdapter();
    const { result } = renderHook(() =>
      useWalletConnections({ autoConnect: false, adapters: [adapter] }),
    );

    await act(async () => {
      await result.current.connectWallet('stellar');
    });

    expect(result.current.activeAccount?.address).toBe('GTESTACCOUNT');
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'bridgewise_wallet_sessions',
      expect.stringContaining('stellar'),
    );
  });

  it('restores a persisted session on mount', async () => {
    storage.bridgewise_wallet_sessions = JSON.stringify([
      {
        walletId: 'stellar',
        walletType: 'stellar',
        chainId: 'stellar:public',
        activeAccountAddress: 'GTESTACCOUNT',
        isActive: true,
      },
    ]);
    const adapter = createMockAdapter();

    const { result } = renderHook(() =>
      useWalletConnections({ autoConnect: true, adapters: [adapter] }),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(adapter.connect).toHaveBeenCalledWith('stellar:public');
    expect(result.current.activeAccount?.address).toBe('GTESTACCOUNT');
    expect(result.current.isRestoring).toBe(false);
  });

  it('clears invalid persisted sessions when restore fails', async () => {
    storage.bridgewise_wallet_sessions = JSON.stringify([
      {
        walletId: 'stellar',
        walletType: 'stellar',
        chainId: 'stellar:public',
        isActive: true,
      },
    ]);
    const adapter = createMockAdapter({
      connect: jest.fn(async () => {
        throw new Error('restore failed');
      }),
    });

    const { result } = renderHook(() =>
      useWalletConnections({ autoConnect: true, adapters: [adapter] }),
    );

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(result.current.wallets).toEqual([]);
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('bridgewise_wallet_sessions');
  });
});
