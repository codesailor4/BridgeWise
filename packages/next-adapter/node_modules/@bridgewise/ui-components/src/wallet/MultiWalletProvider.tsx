import React, { useContext, useMemo } from 'react';
import { useWalletConnections } from './useWalletConnections';
import { MultiWalletContext } from './MultiWalletContext';
import type {
  WalletProviderProps,
  UseWalletConnectionsReturn,
} from './types';

export const MultiWalletProvider: React.FC<WalletProviderProps> = ({
  children,
  adapters,
  autoConnect = true,
  onConnect,
  onDisconnect,
  onError,
}) => {
  const walletConnections = useWalletConnections({
    adapters,
    autoConnect,
    onConnect: (_connection, account) => onConnect?.(account),
    onDisconnect,
    onError,
  });

  const value = useMemo(() => ({ ...walletConnections }), [walletConnections]);

  return (
    <MultiWalletContext.Provider value={value}>
      {children}
    </MultiWalletContext.Provider>
  );
};

export const useMultiWalletContext = (): UseWalletConnectionsReturn => {
  const context = useContext(MultiWalletContext);
  if (!context) {
    throw new Error('useMultiWalletContext must be used within a MultiWalletProvider');
  }
  return context;
};
