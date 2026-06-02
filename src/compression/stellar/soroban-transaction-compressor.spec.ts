import { SorobanTransactionCompressor, SorobanTransactionPayload } from './soroban-transaction-compressor';

const mockPayload: SorobanTransactionPayload = {
  txHash: 'abc123',
  contractId: 'C_BRIDGE_CONTRACT_XYZ',
  method: 'transfer',
  args: {
    from: 'G_SENDER_ACCOUNT',
    to: 'G_RECIPIENT_ACCOUNT',
    amount: '100.0000000',
    asset: 'USDC',
  },
  metadata: {
    bridgeProvider: 'AllBridge',
    sourceChain: 'Stellar',
    destinationChain: 'Ethereum',
  },
};

describe('SorobanTransactionCompressor', () => {
  let compressor: SorobanTransactionCompressor;

  beforeEach(() => {
    compressor = new SorobanTransactionCompressor();
  });

  describe('compress', () => {
    it('should compress a payload and return base64 data', async () => {
      const result = await compressor.compress(mockPayload);
      expect(result.data).toBeTruthy();
      expect(result.algorithm).toBe('deflate');
      expect(result.originalSize).toBeGreaterThan(0);
      expect(result.compressedSize).toBeGreaterThan(0);
    });

    it('should reduce payload size', async () => {
      const result = await compressor.compress(mockPayload);
      expect(result.compressedSize).toBeLessThan(result.originalSize);
    });
  });

  describe('decompress', () => {
    it('should restore original payload after compression', async () => {
      const compressed = await compressor.compress(mockPayload);
      const decompressed = await compressor.decompress(compressed);
      expect(decompressed).toEqual(mockPayload);
    });

    it('should throw on invalid compressed data', async () => {
      await expect(
        compressor.decompress({ data: 'invalid_base64!!!', originalSize: 100, compressedSize: 50, algorithm: 'deflate' }),
      ).rejects.toThrow();
    });
  });

  describe('validate', () => {
    it('should return true when decompressed matches original', async () => {
      const compressed = await compressor.compress(mockPayload);
      const isValid = await compressor.validate(mockPayload, compressed);
      expect(isValid).toBe(true);
    });

    it('should return false on corrupted data', async () => {
      const isValid = await compressor.validate(mockPayload, {
        data: 'corrupted',
        originalSize: 100,
        compressedSize: 50,
        algorithm: 'deflate',
      });
      expect(isValid).toBe(false);
    });
  });

  describe('getStats', () => {
    it('should return compression statistics', async () => {
      const stats = await compressor.getStats(mockPayload);
      expect(stats.originalSize).toBeGreaterThan(0);
      expect(stats.compressedSize).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeLessThan(1);
      expect(stats.savedBytes).toBeGreaterThan(0);
    });
  });

  describe('compressBatch / decompressBatch', () => {
    it('should compress and decompress a batch of payloads', async () => {
      const payloads = [mockPayload, { ...mockPayload, txHash: 'def456', method: 'swap' }];
      const compressed = await compressor.compressBatch(payloads);
      expect(compressed).toHaveLength(2);

      const decompressed = await compressor.decompressBatch(compressed);
      expect(decompressed).toEqual(payloads);
    });
  });
});
