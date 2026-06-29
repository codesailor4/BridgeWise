import { createContext, useContext } from 'react';
import type { UseActiveAccountReturn, UseWalletConnectionsReturn } from './types';

export const MultiWalletContext = createContext<UseWalletConnectionsReturn | null>(null);

export function useActiveAccount(): UseActiveAccountReturn {
  const context = useContext(MultiWalletContext);

  return {
    activeAccount: context?.activeAccount ?? null,
    activeWallet: context?.activeWallet ?? null,
  };
}