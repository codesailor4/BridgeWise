import { useCallback, useEffect, useMemo, useState } from 'react';
import type {
  ChainId,
  WalletType,
  WalletAccount,
  WalletAdapter,
  WalletConnection,
  UseWalletConnectionsReturn,
  UseWalletConnectionsOptions,
  MultiWalletState,
  WalletError,
} from './types';
import { StellarAdapter } from './adapters/StellarAdapter';

const DEFAULT_STORAGE_KEY = 'bridgewise_wallet_sessions';

interface StoredWalletSession {
  walletId: string;
  walletType: WalletType | string;
  chainId?: ChainId;
  activeAccountAddress?: string;
  isActive?: boolean;
}

function createDefaultAdapters(): WalletAdapter[] {
  if (typeof window === 'undefined') {
    return [];
  }

  return [new StellarAdapter()].filter((adapter) => adapter.isAvailable);
}

function createWalletError(code: WalletError['code'], message: string, originalError?: unknown): WalletError {
  return {
    code,
    message,
    originalError,
  };
}

function readStoredSessions(storageKey: string): StoredWalletSession[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const rawValue = window.localStorage.getItem(storageKey);
    if (!rawValue) {
      return [];
    }

    const parsed = JSON.parse(rawValue) as StoredWalletSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    window.localStorage.removeItem(storageKey);
    return [];
  }
}

function persistWalletSessions(
  storageKey: string,
  wallets: WalletConnection[],
  activeWalletIndex: number | null,
): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (wallets.length === 0) {
    window.localStorage.removeItem(storageKey);
    return;
  }

  const sessions: StoredWalletSession[] = wallets.map((wallet, index) => ({
    walletId: wallet.wallet.id,
    walletType: wallet.walletType,
    chainId: wallet.accounts[wallet.activeAccountIndex]?.chainId,
    activeAccountAddress: wallet.accounts[wallet.activeAccountIndex]?.address,
    isActive: activeWalletIndex === index,
  }));

  window.localStorage.setItem(storageKey, JSON.stringify(sessions));
}

function resolveActiveWalletIndex(wallets: WalletConnection[], requestedIndex: number | null): number | null {
  if (wallets.length === 0) {
    return null;
  }

  if (requestedIndex === null || requestedIndex < 0 || requestedIndex >= wallets.length) {
    return 0;
  }

  return requestedIndex;
}

function upsertWalletConnection(
  wallets: WalletConnection[],
  wallet: WalletAdapter,
  account: WalletAccount,
  preferredAccountAddress?: string,
): { wallets: WalletConnection[]; activeWalletIndex: number } {
  const existingIndex = wallets.findIndex(
    (connection) => connection.wallet.id === wallet.id || connection.walletType === wallet.type,
  );

  if (existingIndex >= 0) {
    const existingConnection = wallets[existingIndex];
    const existingAccountIndex = existingConnection.accounts.findIndex(
      (existingAccount) => existingAccount.address === account.address,
    );
    const accounts =
      existingAccountIndex >= 0
        ? existingConnection.accounts.map((existingAccount, index) =>
            index === existingAccountIndex ? account : existingAccount,
          )
        : [...existingConnection.accounts, account];
    const preferredAddress = preferredAccountAddress || account.address;
    const preferredIndex = accounts.findIndex((existingAccount) => existingAccount.address === preferredAddress);
    const nextWallets = [...wallets];

    nextWallets[existingIndex] = {
      walletType: existingConnection.walletType,
      wallet,
      accounts,
      connected: true,
      activeAccountIndex: preferredIndex >= 0 ? preferredIndex : 0,
    };

    return {
      wallets: nextWallets,
      activeWalletIndex: existingIndex,
    };
  }

  return {
    wallets: [
      ...wallets,
      {
        walletType: wallet.type,
        wallet,
        accounts: [account],
        connected: true,
        activeAccountIndex: 0,
      },
    ],
    activeWalletIndex: wallets.length,
  };
}

export function useWalletConnections(
  options: UseWalletConnectionsOptions = {},
): UseWalletConnectionsReturn {
  const {
    adapters,
    autoConnect = true,
    storageKey = DEFAULT_STORAGE_KEY,
    onConnect,
    onDisconnect,
    onError,
  } = options;

  const [state, setState] = useState<MultiWalletState>({
    wallets: [],
    activeWalletIndex: null,
    activeAccount: null,
    error: null,
    isRestoring: autoConnect,
  });

  const availableWallets = useMemo(() => adapters ?? createDefaultAdapters(), [adapters]);

  useEffect(() => {
    persistWalletSessions(storageKey, state.wallets, state.activeWalletIndex);
  }, [state.activeWalletIndex, state.wallets, storageKey]);

  useEffect(() => {
    if (!autoConnect) {
      setState((previousState) => ({
        ...previousState,
        isRestoring: false,
      }));
      return;
    }

    const storedSessions = readStoredSessions(storageKey);

    if (storedSessions.length === 0) {
      setState((previousState) => ({
        ...previousState,
        isRestoring: false,
      }));
      return;
    }

    let isCancelled = false;

    const restoreSessions = async () => {
      let restoredWallets: WalletConnection[] = [];
      let requestedActiveWalletIndex: number | null = null;

      for (const session of storedSessions) {
        const wallet = availableWallets.find(
          (adapter) => adapter.id === session.walletId || adapter.type === session.walletType,
        );

        if (!wallet) {
          continue;
        }

        try {
          const account = await wallet.connect(session.chainId);

          if (isCancelled) {
            await wallet.disconnect().catch(() => undefined);
            return;
          }

          const nextState = upsertWalletConnection(
            restoredWallets,
            wallet,
            account,
            session.activeAccountAddress,
          );

          restoredWallets = nextState.wallets;

          if (session.isActive) {
            requestedActiveWalletIndex = nextState.activeWalletIndex;
          }
        } catch {
          continue;
        }
      }

      if (isCancelled) {
        return;
      }

      const activeWalletIndex = resolveActiveWalletIndex(restoredWallets, requestedActiveWalletIndex);
      const activeWallet = activeWalletIndex !== null ? restoredWallets[activeWalletIndex] : null;

      setState({
        wallets: restoredWallets,
        activeWalletIndex,
        activeAccount:
          activeWalletIndex !== null ? activeWallet?.accounts[activeWallet.activeAccountIndex] ?? null : null,
        error: null,
        isRestoring: false,
      });

      persistWalletSessions(storageKey, restoredWallets, activeWalletIndex);
    };

    void restoreSessions();

    return () => {
      isCancelled = true;
    };
  }, [autoConnect, availableWallets, storageKey]);

  // Connect a new wallet
  const connectWallet = useCallback(
    async (walletType: WalletType | string) => {
      const wallet = availableWallets.find(
        (adapter) => adapter.type === walletType || adapter.id === walletType,
      );

      if (!wallet) {
        const walletError = createWalletError(
          'WALLET_NOT_FOUND',
          `Wallet adapter for ${walletType} is not available`,
        );
        setState((previousState) => ({
          ...previousState,
          error: walletError,
        }));
        onError?.(walletError);
        throw walletError;
      }

      try {
        const account = await wallet.connect();
        let connectedWallet: WalletConnection | null = null;

        setState((previousState) => {
          const nextState = upsertWalletConnection(previousState.wallets, wallet, account);
          connectedWallet = nextState.wallets[nextState.activeWalletIndex] ?? null;

          return {
            wallets: nextState.wallets,
            activeWalletIndex: nextState.activeWalletIndex,
            activeAccount: account,
            error: null,
            isRestoring: false,
          };
        });

        if (connectedWallet) {
          onConnect?.(connectedWallet, account);
        }
      } catch (error) {
        const walletError = (error as WalletError) ??
          createWalletError('CONNECTION_FAILED', `Failed to connect to ${walletType}`, error);
        setState((previousState) => ({
          ...previousState,
          error: walletError,
          isRestoring: false,
        }));
        onError?.(walletError);
        throw walletError;
      }
    },
    [availableWallets, onConnect, onError],
  );

  // Disconnect a wallet
  const disconnectWallet = useCallback(
    async (walletType: WalletType | string) => {
      const currentConnection = state.wallets.find(
        (wallet) => wallet.walletType === walletType || wallet.wallet.id === walletType,
      );

      if (!currentConnection) {
        return;
      }

      try {
        await currentConnection.wallet.disconnect();

        setState((previousState) => {
          const removedWalletIndex = previousState.wallets.findIndex(
            (wallet) => wallet.wallet.id === currentConnection.wallet.id,
          );
          const wallets = previousState.wallets.filter(
            (wallet) => wallet.wallet.id !== currentConnection.wallet.id,
          );
          const activeWalletIndex = resolveActiveWalletIndex(
            wallets,
            previousState.activeWalletIndex === null
              ? null
              : previousState.activeWalletIndex > removedWalletIndex
                ? previousState.activeWalletIndex - 1
                : previousState.activeWalletIndex === removedWalletIndex
                  ? 0
                  : previousState.activeWalletIndex,
          );
          const activeWallet = activeWalletIndex !== null ? wallets[activeWalletIndex] : null;

          return {
            wallets,
            activeWalletIndex,
            activeAccount:
              activeWalletIndex !== null
                ? activeWallet?.accounts[activeWallet.activeAccountIndex] ?? null
                : null,
            error: null,
            isRestoring: false,
          };
        });

        onDisconnect?.(walletType);
      } catch (error) {
        const walletError = (error as WalletError) ??
          createWalletError('DISCONNECT_FAILED', `Failed to disconnect ${walletType}`, error);
        setState((previousState) => ({
          ...previousState,
          error: walletError,
        }));
        onError?.(walletError);
        throw walletError;
      }
    },
    [onDisconnect, onError, state.wallets],
  );

  // Switch active account
  const switchAccount = useCallback((account: WalletAccount) => {
    setState((previousState) => {
      const activeWalletIndex = previousState.wallets.findIndex((wallet) =>
        wallet.accounts.some((walletAccount) => walletAccount.address === account.address),
      );

      if (activeWalletIndex < 0) {
        return previousState;
      }

      const wallets = previousState.wallets.map((wallet, walletIndex) => {
        if (walletIndex !== activeWalletIndex) {
          return wallet;
        }

        return {
          ...wallet,
          activeAccountIndex: wallet.accounts.findIndex(
            (walletAccount) => walletAccount.address === account.address,
          ),
        };
      });

      return {
        ...previousState,
        wallets,
        activeWalletIndex,
        activeAccount: account,
        error: null,
      };
    });
  }, []);

  const activeWallet =
    state.activeWalletIndex !== null ? state.wallets[state.activeWalletIndex] : null;

  return {
    wallets: state.wallets,
    availableWallets,
    connectWallet,
    disconnectWallet,
    switchAccount,
    activeAccount: state.activeAccount,
    activeWallet,
    error: state.error,
    isRestoring: state.isRestoring,
  };
}
