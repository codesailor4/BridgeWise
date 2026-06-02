import * as crypto from 'crypto';

export interface RetryAttempt {
  id: string;
  transactionId: string;
  attemptNumber: number;
  timestamp: Date;
  success: boolean;
  errorCode?: string;
}

export interface RetryMetrics {
  transactionId: string;
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  firstAttemptAt: Date;
  lastAttemptAt: Date;
  averageRetryIntervalMs: number;
  ultimatelySucceeded: boolean;
}

export class StellarRetryAnalytics {
  private attempts: RetryAttempt[] = [];

  /**
   * Logs a retry attempt for a Soroban transaction.
   */
  logAttempt(
    transactionId: string,
    success: boolean,
    errorCode?: string,
  ): RetryAttempt {
    const existing = this.attempts.filter(
      (a) => a.transactionId === transactionId,
    );
    const attempt: RetryAttempt = {
      id: crypto.randomUUID(),
      transactionId,
      attemptNumber: existing.length + 1,
      timestamp: new Date(),
      success,
      errorCode,
    };
    this.attempts.push(attempt);
    return attempt;
  }

  /**
   * Returns all logged retry attempts.
   */
  getAllAttempts(): RetryAttempt[] {
    return this.attempts;
  }

  /**
   * Generates retry metrics for a specific transaction.
   */
  getMetrics(transactionId: string): RetryMetrics | null {
    const txAttempts = this.attempts
      .filter((a) => a.transactionId === transactionId)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    if (txAttempts.length === 0) return null;

    const intervals: number[] = [];
    for (let i = 1; i < txAttempts.length; i++) {
      intervals.push(
        txAttempts[i].timestamp.getTime() -
          txAttempts[i - 1].timestamp.getTime(),
      );
    }

    return {
      transactionId,
      totalAttempts: txAttempts.length,
      successfulAttempts: txAttempts.filter((a) => a.success).length,
      failedAttempts: txAttempts.filter((a) => !a.success).length,
      firstAttemptAt: txAttempts[0].timestamp,
      lastAttemptAt: txAttempts[txAttempts.length - 1].timestamp,
      averageRetryIntervalMs:
        intervals.length > 0
          ? intervals.reduce((s, v) => s + v, 0) / intervals.length
          : 0,
      ultimatelySucceeded: txAttempts[txAttempts.length - 1].success,
    };
  }

  /**
   * Clears all stored attempts (useful for testing).
   */
  clearAttempts(): void {
    this.attempts = [];
  }
}
