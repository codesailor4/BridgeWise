import { SorobanTransactionStatusTracker } from './soroban-transaction-status-tracker';

describe('SorobanTransactionStatusTracker', () => {
  let tracker: SorobanTransactionStatusTracker;

  beforeEach(() => {
    jest.useFakeTimers();
    tracker = new SorobanTransactionStatusTracker({
      sorobanRpcUrl: 'https://soroban-rpc-testnet.stellar.org',
      pollIntervalMs: 5000,
      requiredConfirmations: 2,
      maxPendingAgeMs: 60000,
    });
  });

  afterEach(() => {
    tracker.stopPolling();
    tracker.removeAllListeners();
    jest.useRealTimers();
  });

  describe('Transaction Registration', () => {
    it('should register a new transaction with default fields', () => {
      const record = tracker.trackTransaction({
        transactionId: 'tx-001',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '1000',
      });

      expect(record.transactionId).toBe('tx-001');
      expect(record.status).toBe('pending');
      expect(record.confirmations).toBe(0);
      expect(record.requiredConfirmations).toBe(2);
      expect(record.createdAt).toBeGreaterThan(0);
      expect(record.updatedAt).toBeGreaterThan(0);
    });

    it('should register a transaction with a hash and track it by hash', () => {
      const record = tracker.trackTransaction({
        transactionId: 'tx-002',
        type: 'bridge_withdrawal',
        status: 'submitted',
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        asset: 'ETH',
        amount: '5',
        txHash: 'abc123',
      });

      expect(record.txHash).toBe('abc123');

      const byHash = tracker.getTransactionByHash('abc123');
      expect(byHash).not.toBeNull();
      expect(byHash?.transactionId).toBe('tx-002');
    });

    it('should reject duplicate registration by overwriting', () => {
      tracker.trackTransaction({
        transactionId: 'tx-001',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
      });

      tracker.trackTransaction({
        transactionId: 'tx-001',
        type: 'bridge_withdrawal',
        status: 'submitted',
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        asset: 'ETH',
        amount: '5',
        txHash: 'def456',
      });

      const all = tracker.getAllTransactions();
      expect(all).toHaveLength(1);
      expect(all[0].type).toBe('bridge_withdrawal');
      expect(all[0].txHash).toBe('def456');
    });
  });

  describe('Status Updates', () => {
    it('should update transaction status and emit status-change event', () => {
      const statusChanges: string[] = [];
      tracker.on('status-change', (event) => {
        statusChanges.push(`${event.previousStatus} -> ${event.currentStatus}`);
      });

      tracker.trackTransaction({
        transactionId: 'tx-003',
        type: 'contract_invocation',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'stellar',
        asset: 'XLM',
        amount: '500',
      });

      tracker.updateStatus('tx-003', 'submitted');
      expect(statusChanges).toContain('pending -> submitted');

      const record = tracker.getTransaction('tx-003');
      expect(record?.status).toBe('submitted');
    });

    it('should emit completed event when transaction is confirmed', () => {
      const completedEvents: string[] = [];
      tracker.on('completed', (event) => {
        completedEvents.push(event.transactionId);
      });

      tracker.trackTransaction({
        transactionId: 'tx-004',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '1000',
      });

      tracker.updateStatus('tx-004', 'submitted');
      tracker.updateStatus('tx-004', 'confirmed');
      expect(completedEvents).toContain('tx-004');
    });

    it('should emit failed event when transaction fails', () => {
      const failedEvents: string[] = [];
      tracker.on('failed', (event) => {
        failedEvents.push(event.transactionId);
      });

      tracker.trackTransaction({
        transactionId: 'tx-005',
        type: 'bridge_deposit',
        status: 'submitted',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '500',
      });

      tracker.updateStatus('tx-005', 'failed', {
        errorMessage: 'Insufficient funds',
      });

      expect(failedEvents).toContain('tx-005');
      expect(tracker.getTransaction('tx-005')?.errorMessage).toBe(
        'Insufficient funds',
      );
    });

    it('should not emit events when status does not change', () => {
      const statusChanges: string[] = [];
      tracker.on('status-change', (event) => {
        statusChanges.push(`${event.previousStatus} -> ${event.currentStatus}`);
      });

      tracker.trackTransaction({
        transactionId: 'tx-006',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
      });

      tracker.updateStatus('tx-006', 'pending');
      expect(statusChanges).toHaveLength(0);
    });

    it('should return null when updating unknown transaction', () => {
      const result = tracker.updateStatus('unknown', 'confirmed');
      expect(result).toBeNull();
    });
  });

  describe('Transaction Hash Updates', () => {
    it('should update transaction hash and remap hash lookup', () => {
      tracker.trackTransaction({
        transactionId: 'tx-007',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '1000',
      });

      tracker.updateTransactionHash('tx-007', 'new-hash-xyz');

      expect(tracker.getTransaction('tx-007')?.txHash).toBe('new-hash-xyz');
      expect(tracker.getTransactionByHash('new-hash-xyz')?.transactionId).toBe(
        'tx-007',
      );
    });
  });

  describe('Query and Summary', () => {
    it('should query transactions by status', () => {
      tracker.trackTransaction({
        transactionId: 'tx-a',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
      });
      tracker.trackTransaction({
        transactionId: 'tx-b',
        type: 'bridge_withdrawal',
        status: 'confirmed',
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        asset: 'ETH',
        amount: '10',
      });

      const pending = tracker.queryTransactions({ status: 'pending' });
      expect(pending).toHaveLength(1);
      expect(pending[0].transactionId).toBe('tx-a');
    });

    it('should return a summary counts by status', () => {
      tracker.trackTransaction({
        transactionId: 'tx-c',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
      });
      tracker.trackTransaction({
        transactionId: 'tx-d',
        type: 'bridge_deposit',
        status: 'confirmed',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '200',
      });

      const summary = tracker.getStatusSummary();
      expect(summary.pending).toBe(1);
      expect(summary.confirmed).toBe(1);
      expect(summary.failed).toBe(0);
    });

    it('should remove a transaction from tracking', () => {
      tracker.trackTransaction({
        transactionId: 'tx-e',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
        txHash: 'hash-123',
      });

      expect(tracker.removeTransaction('tx-e')).toBe(true);
      expect(tracker.getTransaction('tx-e')).toBeNull();
      expect(tracker.getTransactionByHash('hash-123')).toBeNull();
    });

    it('should clear all transactions', () => {
      tracker.trackTransaction({
        transactionId: 'tx-f',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
      });
      tracker.trackTransaction({
        transactionId: 'tx-g',
        type: 'bridge_withdrawal',
        status: 'confirmed',
        sourceChain: 'ethereum',
        destinationChain: 'stellar',
        asset: 'ETH',
        amount: '10',
      });

      tracker.clear();
      expect(tracker.getAllTransactions()).toHaveLength(0);
    });
  });

  describe('Polling', () => {
    it('should start and stop polling', () => {
      expect(tracker.isPolling).toBe(false);

      tracker.startPolling();
      expect(tracker.isPolling).toBe(true);

      tracker.stopPolling();
      expect(tracker.isPolling).toBe(false);
    });

    it('should detect expired pending transactions during poll', async () => {
      tracker.trackTransaction({
        transactionId: 'tx-h',
        type: 'bridge_deposit',
        status: 'pending',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
        createdAt: Date.now() - 120000, // created 2 minutes ago (over 60s max age)
      });

      await tracker.pollOnce();

      const record = tracker.getTransaction('tx-h');
      expect(record?.status).toBe('expired');
      expect(record?.errorMessage).toContain('exceeded maximum pending time');
    });

    it('should advance confirmation count for submitted transactions', async () => {
      tracker.trackTransaction({
        transactionId: 'tx-i',
        type: 'bridge_deposit',
        status: 'submitted',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '500',
        txHash: 'hash-submitted-1',
      });

      await tracker.pollOnce();

      const record = tracker.getTransaction('tx-i');
      // With requiredConfirmations=2 and starting confirmations=0,
      // first poll increments to 1 → status becomes awaiting_confirmation
      expect(record?.confirmations).toBe(1);
      expect(record?.status).toBe('awaiting_confirmation');
    });

    it('should confirm transactions when required confirmations reached', async () => {
      tracker.trackTransaction({
        transactionId: 'tx-j',
        type: 'bridge_deposit',
        status: 'submitted',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '500',
        txHash: 'hash-confirm-1',
      });

      // First poll: 1 confirmation → awaiting_confirmation
      await tracker.pollOnce();
      // Second poll: confirmations reach 2 → confirmed
      await tracker.pollOnce();

      const record = tracker.getTransaction('tx-j');
      expect(record?.status).toBe('confirmed');
      expect(record?.confirmations).toBeGreaterThanOrEqual(2);
    });

    it('should poll on interval when started', async () => {
      const pollSpy = jest.spyOn(tracker, 'pollOnce');

      tracker.startPolling();
      expect(pollSpy).toHaveBeenCalledTimes(1); // immediate poll

      jest.advanceTimersByTime(5000);
      expect(pollSpy).toHaveBeenCalledTimes(2);

      jest.advanceTimersByTime(5000);
      expect(pollSpy).toHaveBeenCalledTimes(3);

      tracker.stopPolling();
    });

    it('should handle poll errors without crashing', async () => {
      tracker.trackTransaction({
        transactionId: 'tx-k',
        type: 'bridge_deposit',
        status: 'submitted',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        asset: 'USDC',
        amount: '100',
        txHash: 'hash-error-1',
      });

      // pollOnce should not throw even if individual checks encounter issues
      await expect(tracker.pollOnce()).resolves.not.toThrow();
    });
  });

  describe('Transaction Type Support', () => {
    it('should support bridge_deposit, bridge_withdrawal, and contract_invocation types', () => {
      const types: Array<Parameters<typeof tracker.trackTransaction>[0]> = [
        {
          transactionId: 'type-a',
          type: 'bridge_deposit',
          status: 'pending',
          sourceChain: 'stellar',
          destinationChain: 'ethereum',
          asset: 'USDC',
          amount: '100',
        },
        {
          transactionId: 'type-b',
          type: 'bridge_withdrawal',
          status: 'pending',
          sourceChain: 'ethereum',
          destinationChain: 'stellar',
          asset: 'ETH',
          amount: '5',
        },
        {
          transactionId: 'type-c',
          type: 'contract_invocation',
          status: 'pending',
          sourceChain: 'stellar',
          destinationChain: 'stellar',
          asset: 'XLM',
          amount: '1000',
        },
      ];

      for (const t of types) tracker.trackTransaction(t);

      const deposits = tracker.queryTransactions({ type: 'bridge_deposit' });
      const withdrawals = tracker.queryTransactions({ type: 'bridge_withdrawal' });
      const invocations = tracker.queryTransactions({ type: 'contract_invocation' });

      expect(deposits).toHaveLength(1);
      expect(withdrawals).toHaveLength(1);
      expect(invocations).toHaveLength(1);
    });
  });
});
