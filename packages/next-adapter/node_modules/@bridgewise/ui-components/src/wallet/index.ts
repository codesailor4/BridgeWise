/**
 * Wallet Integration Layer
 * Main entry point for wallet adapters and hooks
 */

// Types
export type {
  WalletAdapter,
  WalletAccount,
  WalletConnection,
  TokenBalance,
  WalletError,
  WalletErrorCode,
  WalletEvent,
  WalletEventCallback,
  MultiWalletState,
  WalletState,
  ChainId,
  NetworkType,
  WalletType,
  WalletTransaction,
  WalletAdapterConfig,
  UseWalletReturn,
  UseWalletOptions,
  UseWalletConnectionsOptions,
  UseWalletConnectionsReturn,
  UseActiveAccountReturn,
  WalletProviderProps,
  WalletContextValue,
  EVMProvider,
  StellarProvider,
  WindowWithEthereum,
  WindowWithStellar,
} from './types';

// Adapters
export { MetaMaskAdapter } from './adapters/MetaMaskAdapter';
export { WalletConnectAdapter } from './adapters/WalletConnectAdapter';
export { StellarAdapter } from './adapters/StellarAdapter';

// Hooks and Provider
export { useWallet } from './useWallet';
export { WalletProvider, useWalletContext } from './WalletProvider';
export { useWalletConnections } from './useWalletConnections';
export { useActiveAccount } from './MultiWalletContext';
export { MultiWalletProvider, useMultiWalletContext } from './MultiWalletProvider';
export { WalletConnector } from './WalletConnector';
