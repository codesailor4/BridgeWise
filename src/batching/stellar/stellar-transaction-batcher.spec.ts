import { StellarTransactionBatcher } from './stellar-transaction-batcher';

describe('StellarTransactionBatcher', () => {
  let batcher: StellarTransactionBatcher;

  beforeEach(() => {
    batcher = new StellarTransactionBatcher();
  });

  it('should group compatible operations into the same batch', () => {
    const operations = [
      {
        operationId: 'op-1',
        routeId: 'route-1',
        bridgeId: 'bridge-a',
        action: 'payment' as const,
        sourceAccount: 'GABC...1',
        destinationAccount: 'GXYZ...2',
        asset: 'XLM',
        amount: '10',
      },
      {
        operationId: 'op-2',
        routeId: 'route-2',
        bridgeId: 'bridge-a',
        action: 'payment' as const,
        sourceAccount: 'GABC...3',
        destinationAccount: 'GXYZ...2',
        asset: 'USDC',
        amount: '5',
      },
      {
        operationId: 'op-3',
        routeId: 'route-3',
        bridgeId: 'bridge-a',
        action: 'contract_call' as const,
        sourceAccount: 'GABC...4',
        destinationAccount: 'GXYZ...5',
        asset: 'USDC',
        amount: '1',
      },
    ];

    const groups = batcher.groupOperations(operations);

    expect(groups).toHaveLength(2);
    expect(groups[0].map((op) => op.operationId)).toEqual(expect.arrayContaining(['op-1', 'op-2']));
    expect(groups[1].map((op) => op.operationId)).toEqual(['op-3']);
  });

  it('should execute a batch successfully', async () => {
    const operations = [
      {
        operationId: 'op-1',
        routeId: 'route-1',
        bridgeId: 'bridge-a',
        action: 'payment' as const,
        sourceAccount: 'GABC...1',
        destinationAccount: 'GXYZ...2',
        asset: 'XLM',
        amount: '10',
      },
    ];

    const result = await batcher.executeBatch(operations);

    expect(result.batchId).toHaveLength(10);
    expect(result.successCount).toBe(1);
    expect(result.failureCount).toBe(0);
    expect(result.results[0].success).toBe(true);
  });

  it('should execute multiple batches when operations are incompatible', async () => {
    const operations = [
      {
        operationId: 'op-1',
        routeId: 'route-1',
        bridgeId: 'bridge-a',
        action: 'payment' as const,
        sourceAccount: 'GABC...1',
        destinationAccount: 'GXYZ...2',
        asset: 'XLM',
        amount: '10',
      },
      {
        operationId: 'op-2',
        routeId: 'route-2',
        bridgeId: 'bridge-a',
        action: 'contract_call' as const,
        sourceAccount: 'GABC...1',
        destinationAccount: 'GXYZ...2',
        asset: 'USDC',
        amount: '5',
      },
    ];

    const results = await batcher.executeBatches(operations);

    expect(results).toHaveLength(2);
    expect(results[0].successCount + results[1].successCount).toBe(2);
  });
});
