import {
  StellarBridgeRetryService,
  isRetryableFailure,
  computeRetryDelay,
} from './stellar-bridge-retry.service';
import { DEFAULT_RETRY_CONFIG } from './stellar-bridge-retry.types';

// ---------------------------------------------------------------------------
// isRetryableFailure
// ---------------------------------------------------------------------------

describe('isRetryableFailure', () => {
  it.each([
    'SEQUENCE_MISMATCH',
    'TRANSACTION_EXPIRED',
    'NETWORK_UNAVAILABLE',
    'RATE_LIMIT_EXCEEDED',
    'INSUFFICIENT_FEE',
    'sequence_mismatch',         // case-insensitive
    'Network timeout',
    'connection refused',
    'HTTP 503 Service Unavailable',
    'HTTP 429',
    'Too many requests',
  ])('returns true for retryable reason: %s', (reason) => {
    expect(isRetryableFailure(reason)).toBe(true);
  });

  it.each([
    'INSUFFICIENT_FUNDS',
    'ACCOUNT_NOT_FOUND',
    'SOROBAN_INVOCATION_FAILED',
    'CONTRACT_NOT_FOUND',
    'UNKNOWN',
    'Bad request',
  ])('returns false for non-retryable reason: %s', (reason) => {
    expect(isRetryableFailure(reason)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// computeRetryDelay
// ---------------------------------------------------------------------------

describe('computeRetryDelay', () => {
  const cfg = { ...DEFAULT_RETRY_CONFIG, initialDelayMs: 1_000, backoffMultiplier: 2, maxDelayMs: 30_000 };

  it('returns initialDelayMs for the first attempt', () => {
    expect(computeRetryDelay(1, cfg)).toBe(1_000);
  });

  it('doubles the delay on each successive attempt', () => {
    expect(computeRetryDelay(2, cfg)).toBe(2_000);
    expect(computeRetryDelay(3, cfg)).toBe(4_000);
    expect(computeRetryDelay(4, cfg)).toBe(8_000);
    expect(computeRetryDelay(5, cfg)).toBe(16_000);
  });

  it('caps the delay at maxDelayMs', () => {
    expect(computeRetryDelay(10, cfg)).toBe(30_000);
    expect(computeRetryDelay(20, cfg)).toBe(30_000);
  });
});

// ---------------------------------------------------------------------------
// StellarBridgeRetryService
// ---------------------------------------------------------------------------

describe('StellarBridgeRetryService', () => {
  const noopSleep = jest.fn().mockResolvedValue(undefined);

  let service: StellarBridgeRetryService;

  beforeEach(() => {
    noopSleep.mockClear();
    service = new StellarBridgeRetryService({}, noopSleep);
  });

  describe('non-retryable failures', () => {
    it('skips the operation entirely and returns totalAttempts = 0', async () => {
      const operation = jest.fn();
      const result = await service.retry('tx-hash', 'INSUFFICIENT_FUNDS', operation);

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(0);
      expect(result.attempts).toHaveLength(0);
      expect(operation).not.toHaveBeenCalled();
    });

    it('includes a descriptive finalError', async () => {
      const result = await service.retry('tx-hash', 'ACCOUNT_NOT_FOUND', jest.fn());
      expect(result.finalError).toContain('Non-retryable');
      expect(result.finalError).toContain('ACCOUNT_NOT_FOUND');
    });
  });

  describe('successful retries', () => {
    it('succeeds on the first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('recovery-tx-1');
      const result = await service.retry('tx-hash', 'SEQUENCE_MISMATCH', operation);

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(1);
      expect(result.recoveryTransactionHash).toBe('recovery-tx-1');
      expect(result.attempts).toHaveLength(1);
      expect(result.attempts[0].success).toBe(true);
    });

    it('succeeds on a subsequent attempt after initial failures', async () => {
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient error'))
        .mockResolvedValue('recovery-tx-2');

      const result = await service.retry('tx-hash', 'Network timeout', operation);

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(2);
      expect(result.recoveryTransactionHash).toBe('recovery-tx-2');
      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0].success).toBe(false);
      expect(result.attempts[1].success).toBe(true);
    });

    it('passes the transferHash to the operation', async () => {
      const operation = jest.fn().mockResolvedValue('recovery-tx');
      await service.retry('specific-tx-hash', 'RATE_LIMIT_EXCEEDED', operation);
      expect(operation).toHaveBeenCalledWith('specific-tx-hash');
    });
  });

  describe('exhausted retries', () => {
    it('returns failure after exhausting all attempts', async () => {
      service = new StellarBridgeRetryService({ maxAttempts: 3 }, noopSleep);
      const operation = jest.fn().mockRejectedValue(new Error('persistent error'));

      const result = await service.retry('tx-hash', 'RATE_LIMIT_EXCEEDED', operation);

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(3);
      expect(result.finalError).toBe('persistent error');
      expect(result.attempts).toHaveLength(3);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('does not set nextRetryDelayMs on the last attempt', async () => {
      service = new StellarBridgeRetryService({ maxAttempts: 2 }, noopSleep);
      const operation = jest.fn().mockRejectedValue(new Error('error'));

      const result = await service.retry('tx-hash', 'TRANSACTION_EXPIRED', operation);

      expect(result.attempts[result.attempts.length - 1].nextRetryDelayMs).toBeUndefined();
    });
  });

  describe('backoff behaviour', () => {
    it('does not sleep before the first attempt', async () => {
      const operation = jest.fn().mockResolvedValue('recovery-tx');
      await service.retry('tx-hash', 'SEQUENCE_MISMATCH', operation);
      expect(noopSleep).not.toHaveBeenCalled();
    });

    it('sleeps with the correct delay before subsequent attempts', async () => {
      // initialDelayMs=500, backoffMultiplier=2 → delay before attempt 2 = 500 * 2^1 = 1000
      service = new StellarBridgeRetryService({ initialDelayMs: 500 }, noopSleep);
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('err'))
        .mockResolvedValue('recovery-tx');

      await service.retry('tx-hash', 'TRANSACTION_EXPIRED', operation);

      expect(noopSleep).toHaveBeenCalledTimes(1);
      expect(noopSleep).toHaveBeenCalledWith(1000);
    });

    it('sets nextRetryDelayMs on non-final failed attempts', async () => {
      service = new StellarBridgeRetryService({ initialDelayMs: 1_000 }, noopSleep);
      const operation = jest
        .fn()
        .mockRejectedValueOnce(new Error('err'))
        .mockResolvedValue('recovery-tx');

      const result = await service.retry('tx-hash', 'NETWORK_UNAVAILABLE', operation);

      expect(result.attempts[0].nextRetryDelayMs).toBe(2_000);
    });
  });
});
