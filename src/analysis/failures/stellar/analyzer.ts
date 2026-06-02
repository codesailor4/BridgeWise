import { parseStellarFailure } from './parse';
import { StellarFailureResponse, FailureAnalysisResult, ParsedFailure } from './types';

/**
 * Analyzes a failed Stellar transfer execution and returns a human-readable,
 * structured breakdown of what went wrong and how to recover.
 *
 * @example
 * const result = analyzeStellarFailure({
 *   extras: { result_codes: { transaction: 'tx_bad_seq' } }
 * });
 * console.log(result.failure.explanation);
 */
export function analyzeStellarFailure(
  response: StellarFailureResponse
): FailureAnalysisResult {
  const failure: ParsedFailure = parseStellarFailure(response);

  return {
    success: false,
    failure,
    timestamp: Date.now(),
  };
}

/**
 * Formats a ParsedFailure into a developer-friendly multi-line string
 * suitable for logging or CLI output.
 */
export function formatFailureForLog(failure: ParsedFailure): string {
  const lines: string[] = [
    `[${failure.severity.toUpperCase()}] ${failure.title} (${failure.code})`,
    `  Explanation   : ${failure.explanation}`,
    `  Recommendation: ${failure.recommendation}`,
    `  Retryable     : ${failure.retryable ? 'Yes' : 'No'}`,
  ];

  if (failure.rawResponse.transactionHash) {
    lines.push(`  TX Hash       : ${failure.rawResponse.transactionHash}`);
  }

  return lines.join('\n');
}

export  type{ StellarFailureResponse, FailureAnalysisResult, ParsedFailure } from './types';