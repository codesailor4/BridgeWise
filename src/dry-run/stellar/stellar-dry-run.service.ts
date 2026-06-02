export interface StellarDryRunRequest {
  routeId: string;
  bridgeId: string;
  sourceAccount: string;
  destinationAccount: string;
  asset: string;
  amount: string;
  memo?: string;
}

export interface StellarDryRunResult {
  routeId: string;
  bridgeId: string;
  estimatedNetworkFee: string;
  estimatedTotalFee: string;
  estimatedExecutionMs: number;
  successLikelihood: number;
  warnings: string[];
  simulatedAt: Date;
}

export class StellarDryRunService {
  simulate(request: StellarDryRunRequest): StellarDryRunResult {
    if (!request.routeId?.trim()) {
      throw new Error('routeId is required');
    }
    if (!request.bridgeId?.trim()) {
      throw new Error('bridgeId is required');
    }
    if (!request.sourceAccount?.trim()) {
      throw new Error('sourceAccount is required');
    }
    if (!request.destinationAccount?.trim()) {
      throw new Error('destinationAccount is required');
    }
    if (!request.asset?.trim()) {
      throw new Error('asset is required');
    }

    const amountValue = parseFloat(request.amount);
    if (Number.isNaN(amountValue) || amountValue <= 0) {
      throw new Error('amount must be a positive numeric value');
    }

    const estimatedNetworkFee = Math.max(0.00005, amountValue * 0.00012);
    const estimatedTotalFee = estimatedNetworkFee * 1.12;
    const estimatedExecutionMs = 300 + Math.min(2_500, amountValue * 10);

    const warnings: string[] = [];
    if (request.sourceAccount === request.destinationAccount) {
      warnings.push('Source and destination accounts are identical. The transfer may be invalid.');
    }
    if (amountValue > 10_000) {
      warnings.push('Large transfer amount may require additional confirmation from the bridge provider.');
    }

    return {
      routeId: request.routeId.trim(),
      bridgeId: request.bridgeId.trim(),
      estimatedNetworkFee: estimatedNetworkFee.toFixed(7),
      estimatedTotalFee: estimatedTotalFee.toFixed(7),
      estimatedExecutionMs,
      successLikelihood: Math.max(
        0.65,
        Math.min(0.99, 0.95 - (amountValue > 10_000 ? 0.10 : 0)),
      ),
      warnings,
      simulatedAt: new Date(),
    };
  }
}
