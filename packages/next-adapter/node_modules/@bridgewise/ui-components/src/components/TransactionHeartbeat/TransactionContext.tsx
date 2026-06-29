/**
 * Transaction Context
 * Manages transaction state across the application
 */

'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { TransactionHistoryStorage } from '../../transaction-history/storage';
import type {
  BridgeTransaction,
  BridgeTransactionStatus,
  TransactionHistoryConfig,
} from '../../transaction-history/types';

export interface TransactionState {
  id: string;
  status: 'idle' | 'pending' | 'success' | 'failed';
  progress: number;
  step: string;
  txHash?: string;
  bridgeName?: string;
  sourceChain?: string;
  destinationChain?: string;
  sourceToken?: string;
  destinationToken?: string;
  amount?: number;
  fee?: number;
  slippagePercent?: number;
  account?: string;
  liquidityAlert?: string;
  timestamp: number;
}

interface TransactionContextType {
  state: TransactionState;
  updateState: (updates: Partial<TransactionState>) => void;
  clearState: () => void;
  startTransaction: (id: string, initialState?: Partial<TransactionState>) => void;
  recordBridgeTransaction: (transaction: Partial<BridgeTransaction>) => Promise<void>;
  executeBatch: (items: BatchTransactionInput[]) => Promise<BatchExecutionResult>;
}

const TransactionContext = createContext<TransactionContextType | undefined>(undefined);

const STORAGE_KEY = 'bridgewise_tx_state';

const mapStatusToHistory = (
  status: TransactionState['status'],
): BridgeTransactionStatus | null => {
  if (status === 'pending') return 'pending';
  if (status === 'success') return 'confirmed';
  if (status === 'failed') return 'failed';
  return null;
};

const normalizeNumber = (value?: number): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : 0;

const normalizeBridgeTransaction = (
  payload: Partial<BridgeTransaction>,
): BridgeTransaction => {
  const now = new Date();
  return {
    txHash: payload.txHash ?? `unknown-${now.getTime()}`,
    bridgeName: payload.bridgeName ?? 'unknown',
    sourceChain: payload.sourceChain ?? 'unknown',
    destinationChain: payload.destinationChain ?? 'unknown',
    sourceToken: payload.sourceToken ?? 'unknown',
    destinationToken: payload.destinationToken ?? 'unknown',
    amount: normalizeNumber(payload.amount),
    fee: normalizeNumber(payload.fee),
    slippagePercent: normalizeNumber(payload.slippagePercent),
    status:
      payload.status === 'pending' || payload.status === 'confirmed' || payload.status === 'failed'
        ? payload.status
        : 'pending',
    timestamp: payload.timestamp ?? now,
    account: payload.account ?? 'unknown',
  };
};

export interface BatchTransactionInput extends Partial<BridgeTransaction> {
  id: string;
}

export interface BatchExecutionResultItem {
  id: string;
  txHash: string;
  success: boolean;
  error?: string;
}

export interface BatchExecutionResult {
  results: BatchExecutionResultItem[];
}

export interface TransactionProviderProps {
  children: ReactNode;
  historyConfig?: TransactionHistoryConfig;
  onTransactionTracked?: (transaction: BridgeTransaction) => void;
}

export const TransactionProvider = ({
  children,
  historyConfig,
  onTransactionTracked,
}: TransactionProviderProps) => {
  const [state, setState] = useState<TransactionState>({
    id: '',
    status: 'idle',
    progress: 0,
    step: '',
    timestamp: 0,
  });
  const [historyStorage] = useState(() => new TransactionHistoryStorage(historyConfig));

  // Load from storage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        // Expiry check (24 hours)
        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          setState(parsed);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (e) {
      console.error('Failed to load transaction state', e);
    }
  }, []);

  // Save to storage on change
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (state.status !== 'idle') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
  }, [state]);

  useEffect(() => {
    const historyStatus = mapStatusToHistory(state.status);
    if (!historyStatus) {
      return;
    }

    const tracked = normalizeBridgeTransaction({
      txHash: state.txHash ?? (state.id ? `pending-${state.id}` : undefined),
      bridgeName: state.bridgeName,
      sourceChain: state.sourceChain,
      destinationChain: state.destinationChain,
      sourceToken: state.sourceToken,
      destinationToken: state.destinationToken,
      amount: state.amount,
      fee: state.fee,
      slippagePercent: state.slippagePercent,
      status: historyStatus,
      timestamp: state.timestamp ? new Date(state.timestamp) : new Date(),
      account: state.account,
    });

    void historyStorage.upsertTransaction(tracked);
    onTransactionTracked?.(tracked);
  }, [historyStorage, onTransactionTracked, state]);

  const updateState = useCallback((updates: Partial<TransactionState>) => {
    setState((prev) => ({ ...prev, ...updates, timestamp: Date.now() }));
  }, []);

  const clearState = useCallback(() => {
    setState({
      id: '',
      status: 'idle',
      progress: 0,
      step: '',
      timestamp: 0,
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const startTransaction = useCallback((id: string, initialState?: Partial<TransactionState>) => {
    setState({
      id,
      status: 'pending',
      progress: 0,
      step: 'Initializing...',
      timestamp: Date.now(),
      ...initialState,
    });
  }, []);

  const executeBatch = useCallback(
    async (items: BatchTransactionInput[]): Promise<BatchExecutionResult> => {
      const results: BatchExecutionResultItem[] = [];
      const total = items.length;

      for (let index = 0; index < items.length; index += 1) {
        const item = items[index];
        const progress = Math.round(((index + 1) / total) * 100);

        startTransaction(item.id, {
          txHash: item.txHash,
          bridgeName: item.bridgeName,
          sourceChain: item.sourceChain,
          destinationChain: item.destinationChain,
          sourceToken: item.sourceToken,
          destinationToken: item.destinationToken,
          amount: item.amount,
          fee: item.fee,
          slippagePercent: item.slippagePercent,
          account: item.account,
          status: 'pending',
          step: `Processing batch item ${index + 1}/${total}`,
          progress,
        });

        try {
          // Simulate delay for transaction processing; replace with real API call if available
          await new Promise((resolve) => setTimeout(resolve, 250));

          const normalized = normalizeBridgeTransaction({
            ...item,
            status: 'confirmed',
            timestamp: new Date(),
          });

          await historyStorage.upsertTransaction(normalized);
          onTransactionTracked?.(normalized);

          results.push({
            id: item.id,
            txHash: normalized.txHash,
            success: true,
          });

          updateState({
            status: 'success',
            step: `Batch item ${index + 1}/${total} confirmed`,
            progress,
            txHash: normalized.txHash,
          });
        } catch (error) {
          const errMessage = error instanceof Error ? error.message : 'Unknown error';

          const failedRecord = normalizeBridgeTransaction({
            ...item,
            status: 'failed',
            timestamp: new Date(),
          });

          await historyStorage.upsertTransaction(failedRecord);
          onTransactionTracked?.(failedRecord);

          results.push({
            id: item.id,
            txHash: failedRecord.txHash,
            success: false,
            error: errMessage,
          });

          updateState({
            status: 'failed',
            step: `Batch item ${index + 1}/${total} failed: ${errMessage}`,
            progress,
            txHash: failedRecord.txHash,
          });
        }
      }

      setState((prev) => ({
        ...prev,
        status: results.every((x) => x.success) ? 'success' : 'failed',
        step: `Batch completed: ${results.filter((x) => x.success).length}/${total} succeeded`,
        progress: 100,
      }));

      return { results };
    },
    [historyStorage, onTransactionTracked, startTransaction, updateState],
  );

  const recordBridgeTransaction = useCallback(
    async (transaction: Partial<BridgeTransaction>) => {
      const normalized = normalizeBridgeTransaction(transaction);
      await historyStorage.upsertTransaction(normalized);
      onTransactionTracked?.(normalized);
    },
    [historyStorage, onTransactionTracked],
  );

  return (
    <TransactionContext.Provider
      value={{
        state,
        updateState,
        clearState,
        startTransaction,
        recordBridgeTransaction,
        executeBatch,
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
};

export const useTransaction = () => {
  const context = useContext(TransactionContext);
  if (!context) {
    throw new Error('useTransaction must be used within a TransactionProvider');
  }
  return context;
};
