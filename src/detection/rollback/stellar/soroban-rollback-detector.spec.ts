import { SorobanRollbackDetector, SorobanTransfer } from './soroban-rollback-detector';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

const mockTransfer: SorobanTransfer = {
  txHash: 'abc123hash',
  contractId: 'C_BRIDGE_CONTRACT',
  fromAccount: 'G_SENDER',
  toAccount: 'G_RECIPIENT',
  amount: '100.0000000',
  asset: 'USDC',
  ledgerSequence: 1000,
  timestamp: Date.now(),
};

describe('SorobanRollbackDetector', () => {
  let detector: SorobanRollbackDetector;

  beforeEach(() => {
    detector = new SorobanRollbackDetector({ sorobanRpcUrl: 'https://soroban-rpc.example.com' });
    jest.clearAllMocks();
  });

  afterEach(() => {
    detector.stopMonitoring();
  });

  describe('trackTransfer', () => {
    it('should track a transfer as pending', () => {
      detector.trackTransfer(mockTransfer);
      expect(detector.getTransferStatus(mockTransfer.txHash)).toBe('pending');
    });
  });

  describe('untrackTransfer', () => {
    it('should remove a tracked transfer', () => {
      detector.trackTransfer(mockTransfer);
      expect(detector.untrackTransfer(mockTransfer.txHash)).toBe(true);
      expect(detector.getTransferStatus(mockTransfer.txHash)).toBeUndefined();
    });
  });

  describe('checkTransaction', () => {
    it('should mark transfer as confirmed on SUCCESS', async () => {
      detector.trackTransfer(mockTransfer);
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: { result: { status: 'SUCCESS' } },
      });

      const status = await detector.checkTransaction(mockTransfer.txHash);
      expect(status).toBe('confirmed');
    });

    it('should emit rollback event on FAILED status', async () => {
      detector.trackTransfer(mockTransfer);
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: { result: { status: 'FAILED', resultXdr: 'error_xdr' } },
      });

      const rollbackSpy = jest.fn();
      detector.on('rollback', rollbackSpy);

      const status = await detector.checkTransaction(mockTransfer.txHash);
      expect(status).toBe('reverted');
      expect(rollbackSpy).toHaveBeenCalledWith(
        expect.objectContaining({ transfer: mockTransfer, previousStatus: 'pending' }),
      );
    });

    it('should emit rollback event on NOT_FOUND status', async () => {
      detector.trackTransfer(mockTransfer);
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: { result: { status: 'NOT_FOUND' } },
      });

      const rollbackSpy = jest.fn();
      detector.on('rollback', rollbackSpy);

      const status = await detector.checkTransaction(mockTransfer.txHash);
      expect(status).toBe('reverted');
      expect(rollbackSpy).toHaveBeenCalled();
    });

    it('should throw if transfer is not tracked', async () => {
      await expect(detector.checkTransaction('unknown_hash')).rejects.toThrow('Transfer not tracked');
    });

    it('should return current status on network error', async () => {
      detector.trackTransfer(mockTransfer);
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Network error'));

      const status = await detector.checkTransaction(mockTransfer.txHash);
      expect(status).toBe('pending');
    });
  });

  describe('checkAll', () => {
    it('should check all pending transfers', async () => {
      const transfer2 = { ...mockTransfer, txHash: 'def456hash' };
      detector.trackTransfer(mockTransfer);
      detector.trackTransfer(transfer2);

      mockedAxios.post = jest.fn().mockResolvedValue({
        data: { result: { status: 'SUCCESS' } },
      });

      const results = await detector.checkAll();
      expect(results.size).toBe(2);
      expect(results.get(mockTransfer.txHash)).toBe('confirmed');
      expect(results.get(transfer2.txHash)).toBe('confirmed');
    });

    it('should skip non-pending transfers', async () => {
      detector.trackTransfer(mockTransfer);
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: { result: { status: 'SUCCESS' } },
      });
      await detector.checkTransaction(mockTransfer.txHash); // now confirmed

      mockedAxios.post = jest.fn(); // should not be called again
      const results = await detector.checkAll();
      expect(results.size).toBe(0);
    });
  });
});
