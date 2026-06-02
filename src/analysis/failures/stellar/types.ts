export type StellarFailureCode =
  | 'INSUFFICIENT_FUNDS'
  | 'ACCOUNT_NOT_FOUND'
  | 'SEQUENCE_MISMATCH'
  | 'TRANSACTION_EXPIRED'
  | 'SOROBAN_INVOCATION_FAILED'
  | 'CONTRACT_NOT_FOUND'
  | 'INSUFFICIENT_FEE'
  | 'RATE_LIMIT_EXCEEDED'
  | 'NETWORK_UNAVAILABLE'
  | 'UNKNOWN';

export interface StellarFailureResponse {
  /** Raw error code from Stellar horizon or Soroban RPC */
  errorCode?: string;
  /** HTTP status or XDR result code */
  resultCode?: string;
  /** Raw error message from the network */
  message?: string;
  /** Transaction hash if the tx was submitted */
  transactionHash?: string;
  /** Extras from Horizon error envelope */
  extras?: {
    result_codes?: {
      transaction?: string;
      operations?: string[];
    };
  };
}

export interface ParsedFailure {
  code: StellarFailureCode;
  title: string;
  explanation: string;
  recommendation: string;
  retryable: boolean;
  /** Severity: low | medium | high | critical */
  severity: 'low' | 'medium' | 'high' | 'critical';
  rawResponse: StellarFailureResponse;
}

export interface FailureAnalysisResult {
  success: false;
  failure: ParsedFailure;
  timestamp: number;
}