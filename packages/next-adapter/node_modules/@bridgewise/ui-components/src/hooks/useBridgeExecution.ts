/**
 * useBridgeExecution Hook
 * Manages cross-chain bridge transaction execution with status tracking
 * Supports both Stellar and EVM transactions with automatic fallback routing
 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  BridgeTransactionStatus,
  TransactionStatusDetails,
  TransactionError,
  BridgeProvider,
  ChainId,
} from '../components/BridgeStatus/types';

/**
 * Fallback route information for UI display
 */
export interface FallbackRouteInfo {
  /** Original route that failed */
  originalRoute: {
    provider: BridgeProvider;
    id: string;
  };
  /** Current fallback route being used */
  fallbackRoute: {
    provider: BridgeProvider;
    id: string;
  };
  /** Number of fallback attempts made */
  attemptNumber: number;
  /** Total available fallback routes */
  totalFallbacks: number;
  /** Reason for fallback */
  reason: string;
}

/**
 * Configuration options for useBridgeExecution
 */
export interface UseBridgeExecutionOptions {
  /** Polling interval in milliseconds */
  pollIntervalMs?: number;
  /** Maximum polling duration in milliseconds */
  maxPollDurationMs?: number;
  /** Number of confirmations required for EVM chains */
  requiredConfirmations?: number;
  /** Estimated time for transaction completion in seconds */
  estimatedTimeSeconds?: number;
  /** Callback when status changes */
  onStatusChange?: (
    status: BridgeTransactionStatus,
    details?: TransactionStatusDetails,
  ) => void;
  /** Callback when transaction is confirmed */
  onConfirmed?: (details: TransactionStatusDetails) => void;
  /** Callback when transaction fails */
  onFailed?: (error: TransactionError) => void;
  /** Whether to auto-start polling on mount */
  autoStart?: boolean;
  /** Enable automatic fallback routing on failure (default: true) */
  enableFallback?: boolean;
  /** Maximum number of fallback attempts (default: 3) */
  maxFallbackAttempts?: number;
  /** Callback when fallback is triggered */
  onFallback?: (info: FallbackRouteInfo) => void;
}

/**
 * Return type for useBridgeExecution hook
 */
export interface UseBridgeExecutionReturn {
  /** Current transaction status */
  status: BridgeTransactionStatus;
  /** Progress percentage (0-100) */
  progress: number;
  /** Current execution step description */
  step: string;
  /** Error information if failed */
  error: TransactionError | null;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining: number;
  /** Number of confirmations received */
  confirmations: number;
  /** Required confirmations for completion */
  requiredConfirmations: number;
  /** Whether currently polling for status */
  isPolling: boolean;
  /** Start transaction monitoring */
  start: (
    txHash: string,
    provider: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    amount?: number,
    token?: string,
    fee?: number,
    slippagePercent?: number,
  ) => void;
  /** Stop transaction monitoring */
  stop: () => void;
  /** Retry failed transaction */
  retry: () => void;
  /** Current transaction details */
  details: TransactionStatusDetails | null;
  /** Whether transaction is pending */
  isPending: boolean;
  /** Whether transaction is confirmed */
  isConfirmed: boolean;
  /** Whether transaction failed */
  isFailed: boolean;
  /** Fallback route information (if fallback is active) */
  fallbackInfo: FallbackRouteInfo | null;
  /** Whether a fallback is currently in progress */
  isFallbackActive: boolean;
  /** Number of fallback attempts made */
  fallbackAttempts: number;
  /** Start transaction monitoring with fallback routes */
  startWithFallback: (
    txHash: string,
    provider: BridgeProvider,
    sourceChain: ChainId,
    destinationChain: ChainId,
    fallbackRoutes: Array<{ provider: BridgeProvider; id: string }>,
    amount?: number,
    token?: string,
    fee?: number,
    slippagePercent?: number,
  ) => void;
}

// Default configuration
const DEFAULT_POLL_INTERVAL_MS = 3000;
const DEFAULT_MAX_POLL_DURATION_MS = 10 * 60 * 1000; // 10 minutes
const DEFAULT_REQUIRED_CONFIRMATIONS = 12;
const DEFAULT_ESTIMATED_TIME_SECONDS = 180; // 3 minutes
const DEFAULT_MAX_FALLBACK_ATTEMPTS = 3;

// Chain-specific confirmation requirements
const CHAIN_CONFIRMATIONS: Record<string, number> = {
  ethereum: 12,
  polygon: 20,
  arbitrum: 10,
  optimism: 10,
  base: 10,
  stellar: 1, // Stellar has instant finality
  solana: 32,
};

// Chain-specific estimated times (in seconds)
const CHAIN_ESTIMATED_TIMES: Record<string, number> = {
  ethereum: 180,
  polygon: 120,
  arbitrum: 60,
  optimism: 60,
  base: 60,
  stellar: 30,
  solana: 30,
};

/**
 * Mock function to simulate transaction status checking
 * In production, this would call actual bridge APIs or RPC endpoints
 */
const checkTransactionStatus = async (
  txHash: string,
  provider: BridgeProvider,
  sourceChain: ChainId,
  destinationChain: ChainId,
): Promise<{
  status: BridgeTransactionStatus;
  progress: number;
  confirmations: number;
  step: string;
}> => {
  // Simulate API call delay
  await new Promise((resolve) => setTimeout(resolve, 500));

  // This is a mock implementation
  // In production, this would:
  // 1. Call the bridge provider's API
  // 2. Check source chain RPC for confirmations
  // 3. Check destination chain for completion
  // 4. Return actual status

  const random = Math.random();

  // Simulate progressive status
  if (random < 0.1) {
    return {
      status: 'pending',
      progress: 10,
      confirmations: 0,
      step: 'Submitting to source chain...',
    };
  } else if (random < 0.3) {
    return {
      status: 'pending',
      progress: 30,
      confirmations: 2,
      step: 'Waiting for source confirmations...',
    };
  } else if (random < 0.5) {
    return {
      status: 'pending',
      progress: 50,
      confirmations: 6,
      step: 'Relaying to destination chain...',
    };
  } else if (random < 0.7) {
    return {
      status: 'pending',
      progress: 75,
      confirmations: 10,
      step: 'Finalizing on destination...',
    };
  } else if (random < 0.9) {
    return {
      status: 'confirmed',
      progress: 100,
      confirmations:
        CHAIN_CONFIRMATIONS[destinationChain.toLowerCase()] ||
        DEFAULT_REQUIRED_CONFIRMATIONS,
      step: 'Transaction complete',
    };
  } else {
    // Simulate occasional failures
    return {
      status: 'failed',
      progress: 0,
      confirmations: 0,
      step: 'Transaction failed',
    };
  }
};

/**
 * Hook for managing bridge transaction execution
 *
 * @example
 * ```tsx
 * const {
 *   status,
 *   progress,
 *   isPending,
 *   start,
 *   retry
 * } = useBridgeExecution({
 *   onStatusChange: (status) => console.log('Status:', status),
 *   onConfirmed: (details) => console.log('Confirmed:', details),
 * });
 *
 * // Start monitoring a transaction
 * start('0x123...', 'hop', 'ethereum', 'polygon');
 * ```
 */
export function useBridgeExecution(
  options: UseBridgeExecutionOptions = {},
): UseBridgeExecutionReturn {
  const {
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    maxPollDurationMs = DEFAULT_MAX_POLL_DURATION_MS,
    requiredConfirmations: userConfirmations,
    estimatedTimeSeconds: userEstimatedTime,
    onStatusChange,
    onConfirmed,
    onFailed,
    autoStart = false,
    enableFallback = true,
    maxFallbackAttempts = DEFAULT_MAX_FALLBACK_ATTEMPTS,
    onFallback,
  } = options;

  // State
  const [status, setStatus] = useState<BridgeTransactionStatus>('pending');
  const [progress, setProgress] = useState(0);
  const [step, setStep] = useState('Initializing...');
  const [error, setError] = useState<TransactionError | null>(null);
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState(
    userEstimatedTime || DEFAULT_ESTIMATED_TIME_SECONDS,
  );
  const [confirmations, setConfirmations] = useState(0);
  const [isPolling, setIsPolling] = useState(false);
  const [details, setDetails] = useState<TransactionStatusDetails | null>(null);

  // Fallback state
  const [fallbackInfo, setFallbackInfo] = useState<FallbackRouteInfo | null>(
    null,
  );
  const [isFallbackActive, setIsFallbackActive] = useState(false);
  const [fallbackAttempts, setFallbackAttempts] = useState(0);

  // Refs for managing polling
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartTimeRef = useRef<number>(0);
  const txInfoRef = useRef<{
    txHash: string;
    provider: BridgeProvider;
    sourceChain: ChainId;
    destinationChain: ChainId;
    amount: number;
    token?: string;
    fee?: number;
    slippagePercent?: number;
  } | null>(null);

  // Fallback routes ref (stores alternative routes for fallback)
  const fallbackRoutesRef = useRef<
    Array<{ provider: BridgeProvider; id: string }>
  >([]);
  const originalRouteRef = useRef<{
    provider: BridgeProvider;
    id: string;
  } | null>(null);

  const requiredConfirmations =
    userConfirmations ||
    (txInfoRef.current?.destinationChain
      ? CHAIN_CONFIRMATIONS[txInfoRef.current.destinationChain.toLowerCase()] ||
        DEFAULT_REQUIRED_CONFIRMATIONS
      : DEFAULT_REQUIRED_CONFIRMATIONS);

  // Computed states
  const isPending = status === 'pending';
  const isConfirmed = status === 'confirmed';
  const isFailed = status === 'failed';

  // Clear polling interval
  const clearPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Create transaction details object
  const createDetails = useCallback((): TransactionStatusDetails | null => {
    if (!txInfoRef.current) return null;
    const {
      txHash,
      provider,
      sourceChain,
      destinationChain,
      amount,
      token,
      fee,
      slippagePercent,
    } = txInfoRef.current;
    return {
      txHash,
      status,
      bridgeName: provider,
      sourceChain,
      destinationChain,
      amount,
      token,
      fee,
      slippagePercent,
      progress,
      estimatedTimeRemaining,
      confirmations,
      requiredConfirmations,
      timestamp: Date.now(),
    };
  }, [
    status,
    progress,
    estimatedTimeRemaining,
    confirmations,
    requiredConfirmations,
  ]);

  // Trigger fallback to next available route
  const triggerFallback = useCallback(
    (reason: string): boolean => {
      if (!enableFallback) return false;
      if (fallbackAttempts >= maxFallbackAttempts) return false;
      if (fallbackRoutesRef.current.length === 0) return false;

      const nextRoute = fallbackRoutesRef.current.shift();
      if (!nextRoute || !txInfoRef.current || !originalRouteRef.current)
        return false;

      const newAttempt = fallbackAttempts + 1;
      setFallbackAttempts(newAttempt);
      setIsFallbackActive(true);

      const info: FallbackRouteInfo = {
        originalRoute: originalRouteRef.current,
        fallbackRoute: nextRoute,
        attemptNumber: newAttempt,
        totalFallbacks: fallbackRoutesRef.current.length + 1,
        reason,
      };

      setFallbackInfo(info);
      setStep(`Switching to fallback route (${nextRoute.provider})...`);
      setProgress(5);
      setStatus('pending');
      setError(null);

      // Update the current provider to the fallback
      txInfoRef.current = {
        ...txInfoRef.current,
        provider: nextRoute.provider,
      };

      // Notify callback
      onFallback?.(info);

      // Restart polling with new provider
      pollStartTimeRef.current = Date.now();

      return true;
    },
    [enableFallback, fallbackAttempts, maxFallbackAttempts, onFallback],
  );

  // Update status with callbacks
  const updateStatus = useCallback(
    (
      newStatus: BridgeTransactionStatus,
      newDetails?: TransactionStatusDetails,
    ) => {
      setStatus(newStatus);
      const detailsToSend = newDetails || createDetails();

      if (detailsToSend) {
        setDetails(detailsToSend);
        onStatusChange?.(newStatus, detailsToSend);

        if (newStatus === 'confirmed') {
          setIsFallbackActive(false);
          onConfirmed?.(detailsToSend);
        } else if (newStatus === 'failed') {
          // Attempt fallback before reporting failure
          const fallbackTriggered = triggerFallback(
            `Route ${detailsToSend.bridgeName} failed`,
          );

          if (!fallbackTriggered) {
            // No fallback available, report actual failure
            setIsFallbackActive(false);
            const txError: TransactionError = {
              code: 'TRANSACTION_FAILED',
              message:
                fallbackAttempts > 0
                  ? `Transaction failed after ${fallbackAttempts} fallback attempts`
                  : 'Transaction failed during execution',
              txHash: detailsToSend.txHash,
              recoverable: true,
              suggestedAction: 'retry',
            };
            setError(txError);
            onFailed?.(txError);
          }
        }
      }
    },
    [
      createDetails,
      onStatusChange,
      onConfirmed,
      onFailed,
      triggerFallback,
      fallbackAttempts,
    ],
  );

  // Poll for transaction status
  const pollStatus = useCallback(async () => {
    if (!txInfoRef.current) return;

    const { txHash, provider, sourceChain, destinationChain } =
      txInfoRef.current;

    // Check for timeout
    if (Date.now() - pollStartTimeRef.current > maxPollDurationMs) {
      clearPolling();
      const timeoutError: TransactionError = {
        code: 'POLLING_TIMEOUT',
        message:
          'Transaction monitoring timed out. Please check explorer for status.',
        txHash,
        recoverable: false,
        suggestedAction: 'contact_support',
      };
      setError(timeoutError);
      updateStatus('failed', createDetails() || undefined);
      onFailed?.(timeoutError);
      return;
    }

    try {
      const result = await checkTransactionStatus(
        txHash,
        provider,
        sourceChain,
        destinationChain,
      );

      setProgress(result.progress);
      setStep(result.step);
      setConfirmations(result.confirmations);

      // Update estimated time remaining
      setEstimatedTimeRemaining((prev) => {
        if (result.status === 'confirmed') return 0;
        const elapsed = (Date.now() - pollStartTimeRef.current) / 1000;
        const total =
          userEstimatedTime ||
          CHAIN_ESTIMATED_TIMES[destinationChain.toLowerCase()] ||
          DEFAULT_ESTIMATED_TIME_SECONDS;
        return Math.max(0, Math.round(total - elapsed));
      });

      if (result.status !== status) {
        updateStatus(result.status, createDetails() || undefined);

        if (result.status === 'confirmed' || result.status === 'failed') {
          clearPolling();
        }
      }
    } catch (err) {
      console.error('Error polling transaction status:', err);
      // Don't stop polling on error, just retry next interval
    }
  }, [
    status,
    maxPollDurationMs,
    userEstimatedTime,
    clearPolling,
    updateStatus,
    createDetails,
    onFailed,
  ]);

  // Start monitoring a transaction
  const start = useCallback(
    (
      txHash: string,
      provider: BridgeProvider,
      sourceChain: ChainId,
      destinationChain: ChainId,
      amount: number = 0,
      token?: string,
      fee?: number,
      slippagePercent?: number,
    ) => {
      // Reset state
      setStatus('pending');
      setProgress(0);
      setStep('Initializing...');
      setError(null);
      setConfirmations(0);
      setEstimatedTimeRemaining(
        userEstimatedTime ||
          CHAIN_ESTIMATED_TIMES[destinationChain.toLowerCase()] ||
          DEFAULT_ESTIMATED_TIME_SECONDS,
      );

      // Store transaction info
      txInfoRef.current = {
        txHash,
        provider,
        sourceChain,
        destinationChain,
        amount,
        token,
        fee,
        slippagePercent,
      };

      // Start polling
      pollStartTimeRef.current = Date.now();
      setIsPolling(true);

      // Initial status check
      void pollStatus();

      // Set up polling interval
      pollIntervalRef.current = setInterval(() => {
        void pollStatus();
      }, pollIntervalMs);
    },
    [pollIntervalMs, userEstimatedTime, pollStatus],
  );

  /**
   * Start monitoring with fallback routes
   * @param fallbackRoutes - Alternative routes to try on failure
   */
  const startWithFallback = useCallback(
    (
      txHash: string,
      provider: BridgeProvider,
      sourceChain: ChainId,
      destinationChain: ChainId,
      fallbackRoutes: Array<{ provider: BridgeProvider; id: string }>,
      amount: number = 0,
      token?: string,
      fee?: number,
      slippagePercent?: number,
    ) => {
      // Store original route and fallbacks
      originalRouteRef.current = { provider, id: txHash };
      fallbackRoutesRef.current = [...fallbackRoutes];
      setFallbackAttempts(0);
      setFallbackInfo(null);
      setIsFallbackActive(false);

      // Start with primary route
      start(
        txHash,
        provider,
        sourceChain,
        destinationChain,
        amount,
        token,
        fee,
        slippagePercent,
      );
    },
    [start],
  );

  // Stop monitoring
  const stop = useCallback(() => {
    clearPolling();
    setIsFallbackActive(false);
  }, [clearPolling]);

  // Retry failed transaction
  const retry = useCallback(() => {
    // Reset fallback state on manual retry
    setFallbackAttempts(0);
    setFallbackInfo(null);
    setIsFallbackActive(false);

    if (txInfoRef.current) {
      const {
        txHash,
        provider,
        sourceChain,
        destinationChain,
        amount,
        token,
        fee,
        slippagePercent,
      } = txInfoRef.current;
      start(
        txHash,
        provider,
        sourceChain,
        destinationChain,
        amount,
        token,
        fee,
        slippagePercent,
      );
    }
  }, [start]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearPolling();
    };
  }, [clearPolling]);

  return {
    status,
    progress,
    step,
    error,
    estimatedTimeRemaining,
    confirmations,
    requiredConfirmations,
    isPolling,
    start,
    startWithFallback,
    stop,
    retry,
    details,
    isPending,
    isConfirmed,
    isFailed,
    fallbackInfo,
    isFallbackActive,
    fallbackAttempts,
  };
}

export default useBridgeExecution;
