import {
  RetryConfig,
  DEFAULT_RETRY_CONFIG,
  RETRYABLE_FAILURE_CODES,
  RetryAttempt,
  RetryResult,
  BridgeOperationFn,
} from './stellar-bridge-retry.types';

/**
 * Determine whether a failure reason string represents a transient error that
 * is safe to retry automatically.
 *
 * Detection covers both named failure codes (SEQUENCE_MISMATCH, etc.) and
 * common network-level patterns (timeout, 503, 429, …).
 */
export function isRetryableFailure(failureReason: string): boolean {
  const upper = failureReason.toUpperCase();
  for (const code of RETRYABLE_FAILURE_CODES) {
    if (upper.includes(code)) return true;
  }
  return /timeout|network.*unavailable|connection.*refused|503|429|too.*many.*requests/i.test(
    failureReason,
  );
}

/**
 * Compute the exponential backoff delay (in ms) for a given attempt number.
 *
 * Formula: `min(initialDelayMs * backoffMultiplier^(attempt - 1), maxDelayMs)`
 *
 * @param attemptNumber  1-based attempt index
 * @param config         Retry configuration (defaults to DEFAULT_RETRY_CONFIG)
 */
export function computeRetryDelay(
  attemptNumber: number,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
): number {
  const delay =
    config.initialDelayMs * Math.pow(config.backoffMultiplier, attemptNumber - 1);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Retries failed Stellar bridge operations automatically.
 *
 * Responsibilities:
 *  - Detect retryable failures using {@link isRetryableFailure}
 *  - Execute retry attempts with exponential backoff via {@link computeRetryDelay}
 *  - Track per-attempt history and return a full {@link RetryResult}
 *
 * The `sleep` dependency is injected so it can be replaced with a no-op in
 * tests, keeping them fast and deterministic.
 *
 * Example:
 *   const retryService = new StellarBridgeRetryService({ maxAttempts: 3 });
 *   const result = await retryService.retry(
 *     transferHash,
 *     failureReason,
 *     (hash) => bridgeClient.resubmit(hash),
 *   );
 */
export class StellarBridgeRetryService {
  private readonly config: RetryConfig;

  constructor(
    config: Partial<RetryConfig> = {},
    private readonly sleep: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {
    this.config = { ...DEFAULT_RETRY_CONFIG, ...config };
  }

  /**
   * Retry a failed bridge operation until it succeeds or all attempts are
   * exhausted.
   *
   * If the `failureReason` is classified as non-retryable the operation is
   * never invoked and `RetryResult.totalAttempts` is 0.
   *
   * @param transferHash  Stellar transaction hash of the failed transfer
   * @param failureReason Human-readable or code-based reason for initial failure
   * @param operation     Async function that performs the bridge operation.
   *                      Resolves to the recovery transaction hash on success,
   *                      throws on failure.
   */
  async retry(
    transferHash: string,
    failureReason: string,
    operation: BridgeOperationFn,
  ): Promise<RetryResult> {
    if (!isRetryableFailure(failureReason)) {
      return {
        transferHash,
        totalAttempts: 0,
        success: false,
        finalError: `Non-retryable failure: ${failureReason}`,
        attempts: [],
      };
    }

    const attempts: RetryAttempt[] = [];

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      const startedAt = Date.now();

      if (attempt > 1) {
        await this.sleep(computeRetryDelay(attempt, this.config));
      }

      try {
        const recoveryTransactionHash = await operation(transferHash);
        attempts.push({ attemptNumber: attempt, startedAt, success: true });
        return {
          transferHash,
          totalAttempts: attempt,
          success: true,
          recoveryTransactionHash,
          attempts,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const isLastAttempt = attempt >= this.config.maxAttempts;

        attempts.push({
          attemptNumber: attempt,
          startedAt,
          success: false,
          error: errorMessage,
          nextRetryDelayMs: isLastAttempt
            ? undefined
            : computeRetryDelay(attempt + 1, this.config),
        });
      }
    }

    return {
      transferHash,
      totalAttempts: this.config.maxAttempts,
      success: false,
      finalError: attempts[attempts.length - 1]?.error,
      attempts,
    };
  }
}
