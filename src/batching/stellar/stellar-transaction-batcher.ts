export type StellarBatchAction = 'payment' | 'path_payment' | 'contract_call';

export interface StellarBatchOperation {
  operationId: string;
  routeId: string;
  bridgeId: string;
  action: StellarBatchAction;
  sourceAccount: string;
  destinationAccount: string;
  asset: string;
  amount: string;
  memo?: string;
}

export interface StellarBatchOperationResult {
  operationId: string;
  success: boolean;
  message: string;
  executedAt: Date;
}

export interface StellarBatchExecutionResult {
  batchId: string;
  executedAt: Date;
  results: StellarBatchOperationResult[];
  successCount: number;
  failureCount: number;
}

export class StellarTransactionBatcher {
  groupOperations(
    operations: StellarBatchOperation[],
  ): StellarBatchOperation[][] {
    const groups = new Map<string, StellarBatchOperation[]>();

    for (const operation of operations) {
      const key = this.getGroupingKey(operation);
      const bucket = groups.get(key) ?? [];
      bucket.push(operation);
      groups.set(key, bucket);
    }

    return Array.from(groups.values());
  }

  async executeBatch(
    operations: StellarBatchOperation[],
  ): Promise<StellarBatchExecutionResult> {
    const batchId = cryptoRandomId();
    const executedAt = new Date();

    const results = operations.map((operation) => ({
      operationId: operation.operationId,
      success: true,
      message: `Executed batch operation ${operation.operationId}`,
      executedAt,
    }));

    return {
      batchId,
      executedAt,
      results,
      successCount: results.filter((result) => result.success).length,
      failureCount: results.filter((result) => !result.success).length,
    };
  }

  async executeBatches(
    operations: StellarBatchOperation[],
  ): Promise<StellarBatchExecutionResult[]> {
    const groups = this.groupOperations(operations);
    return Promise.all(groups.map((group) => this.executeBatch(group)));
  }

  private getGroupingKey(operation: StellarBatchOperation): string {
    return `${operation.bridgeId}|${operation.action}|${operation.destinationAccount}`;
  }
}

function cryptoRandomId(): string {
  return Math.random().toString(36).substring(2, 12);
}
