import {
    StellarFailureCode,
    StellarFailureResponse,
    ParsedFailure,
  } from './types';
  
  /**
   * Maps known Stellar/Soroban result codes to internal failure codes.
   * Horizon result codes: https://developers.stellar.org/api/errors/result-codes
   */
  const RESULT_CODE_MAP: Record<string, StellarFailureCode> = {
    tx_insufficient_balance: 'INSUFFICIENT_FUNDS',
    op_underfunded: 'INSUFFICIENT_FUNDS',
    tx_no_account: 'ACCOUNT_NOT_FOUND',
    op_no_destination: 'ACCOUNT_NOT_FOUND',
    tx_bad_seq: 'SEQUENCE_MISMATCH',
    tx_too_late: 'TRANSACTION_EXPIRED',
    tx_too_early: 'TRANSACTION_EXPIRED',
    tx_insufficient_fee: 'INSUFFICIENT_FEE',
    op_rate_limit_exceeded: 'RATE_LIMIT_EXCEEDED',
  };
  
  const MESSAGE_PATTERN_MAP: Array<[RegExp, StellarFailureCode]> = [
    [/insufficient.*(balance|funds)/i, 'INSUFFICIENT_FUNDS'],
    [/account.*not.*found|no.*such.*account/i, 'ACCOUNT_NOT_FOUND'],
    [/sequence.*mismatch|bad.*seq/i, 'SEQUENCE_MISMATCH'],
    [/transaction.*expired|too.*late|too.*early/i, 'TRANSACTION_EXPIRED'],
    [/soroban.*invocation.*failed|invoke.*contract.*failed/i, 'SOROBAN_INVOCATION_FAILED'],
    [/contract.*not.*found|wasm.*not.*found/i, 'CONTRACT_NOT_FOUND'],
    [/insufficient.*fee|fee.*too.*low/i, 'INSUFFICIENT_FEE'],
    [/rate.*limit|too.*many.*requests/i, 'RATE_LIMIT_EXCEEDED'],
    [/network.*unavailable|connection.*refused|timeout/i, 'NETWORK_UNAVAILABLE'],
  ];
  
  const FAILURE_METADATA: Record<
    StellarFailureCode,
    Omit<ParsedFailure, 'code' | 'rawResponse'>
  > = {
    INSUFFICIENT_FUNDS: {
      title: 'Insufficient Funds',
      explanation:
        'The source account does not have enough XLM or token balance to complete this transfer, including fees.',
      recommendation:
        'Top up the source account with sufficient funds and retry the transaction.',
      retryable: false,
      severity: 'high',
    },
    ACCOUNT_NOT_FOUND: {
      title: 'Account Not Found',
      explanation:
        'One of the accounts involved in this transfer (source or destination) does not exist on the Stellar network.',
      recommendation:
        'Verify both account addresses are correct and that the destination account has been funded with the minimum XLM reserve (1 XLM).',
      retryable: false,
      severity: 'high',
    },
    SEQUENCE_MISMATCH: {
      title: 'Transaction Sequence Mismatch',
      explanation:
        'The transaction sequence number is out of sync with the current account sequence on the network. This can happen due to concurrent submissions or a stale sequence number.',
      recommendation:
        'Fetch the latest account sequence number and rebuild the transaction before retrying.',
      retryable: true,
      severity: 'medium',
    },
    TRANSACTION_EXPIRED: {
      title: 'Transaction Expired',
      explanation:
        'The transaction was not included in a ledger before its time bounds expired (too_late) or the ledger time has not reached the valid window (too_early).',
      recommendation:
        'Rebuild the transaction with updated time bounds and resubmit.',
      retryable: true,
      severity: 'medium',
    },
    SOROBAN_INVOCATION_FAILED: {
      title: 'Soroban Contract Invocation Failed',
      explanation:
        'The Soroban smart contract call was rejected by the network. This is typically due to a contract assertion, invalid input, or insufficient resource budget.',
      recommendation:
        'Review contract call parameters. Check that the resource fee and footprint are correctly simulated using simulateTransaction before submitting.',
      retryable: false,
      severity: 'critical',
    },
    CONTRACT_NOT_FOUND: {
      title: 'Contract Not Found',
      explanation:
        'The target Soroban contract WASM or contract instance could not be located on the network. The contract may have been deployed on a different network or not yet uploaded.',
      recommendation:
        'Confirm the contract ID and that you are targeting the correct network (Mainnet/Testnet/Futurenet).',
      retryable: false,
      severity: 'critical',
    },
    INSUFFICIENT_FEE: {
      title: 'Insufficient Transaction Fee',
      explanation:
        'The fee attached to this transaction is below the current network base fee or the Soroban resource fee estimate.',
      recommendation:
        'Use fee bump transactions or re-simulate with current network conditions to get an accurate fee estimate.',
      retryable: true,
      severity: 'medium',
    },
    RATE_LIMIT_EXCEEDED: {
      title: 'Rate Limit Exceeded',
      explanation:
        'The submission endpoint has received too many requests from this source in a short window.',
      recommendation:
        'Implement exponential backoff with jitter and retry after a cooldown period.',
      retryable: true,
      severity: 'low',
    },
    NETWORK_UNAVAILABLE: {
      title: 'Network Unavailable',
      explanation:
        'The Stellar Horizon or Soroban RPC node could not be reached. This may indicate a node outage, network partition, or connectivity issue.',
      recommendation:
        'Check node health and fall back to an alternate RPC endpoint if available.',
      retryable: true,
      severity: 'high',
    },
    UNKNOWN: {
      title: 'Unknown Failure',
      explanation:
        'An unrecognized error was returned by the Stellar network. This may be a transient issue or an undocumented result code.',
      recommendation:
        'Inspect the raw response for additional context and consult Stellar developer documentation.',
      retryable: false,
      severity: 'medium',
    },
  };
  
  /**
   * Resolves a StellarFailureCode from a raw failure response using
   * result codes first, then message pattern matching as fallback.
   */
  export function resolveFailureCode(
    response: StellarFailureResponse
  ): StellarFailureCode {
    // 1. Try direct result code from extras
    const txCode = response.extras?.result_codes?.transaction;
    if (txCode && RESULT_CODE_MAP[txCode]) {
      return RESULT_CODE_MAP[txCode];
    }
  
    // 2. Try operation-level result codes
    const opCodes = response.extras?.result_codes?.operations ?? [];
    for (const opCode of opCodes) {
      if (RESULT_CODE_MAP[opCode]) {
        return RESULT_CODE_MAP[opCode];
      }
    }
  
    // 3. Try top-level resultCode field
    if (response.resultCode && RESULT_CODE_MAP[response.resultCode]) {
      return RESULT_CODE_MAP[response.resultCode];
    }
  
    // 4. Pattern match on error message
    const message = response.message ?? response.errorCode ?? '';
    for (const [pattern, code] of MESSAGE_PATTERN_MAP) {
      if (pattern.test(message)) {
        return code;
      }
    }
  
    return 'UNKNOWN';
  }
  
  /**
   * Parses a raw Stellar/Soroban failure response into a structured ParsedFailure.
   */
  export function parseStellarFailure(
    response: StellarFailureResponse
  ): ParsedFailure {
    const code = resolveFailureCode(response);
    const meta = FAILURE_METADATA[code];
    return {
      code,
      ...meta,
      rawResponse: response,
    };
  }