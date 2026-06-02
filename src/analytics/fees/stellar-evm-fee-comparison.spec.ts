import { StellarEvmFeeComparisonEngine } from './stellar-evm-fee-comparison';

// Helper to seed the engine with a set of records
function seed(engine: StellarEvmFeeComparisonEngine) {
  // Stellar bridges for stellar → ethereum
  engine.recordFee({
    bridgeId: 'stellar-bridge-a',
    bridgeType: 'stellar',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    feeUsd: 0.5,
  });
  engine.recordFee({
    bridgeId: 'stellar-bridge-a',
    bridgeType: 'stellar',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    feeUsd: 0.7,
  });
  // EVM bridge for stellar → ethereum (more expensive)
  engine.recordFee({
    bridgeId: 'evm-bridge-b',
    bridgeType: 'evm',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    feeUsd: 2.0,
  });
  engine.recordFee({
    bridgeId: 'evm-bridge-b',
    bridgeType: 'evm',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    feeUsd: 1.8,
  });
  // Another route: stellar → polygon
  engine.recordFee({
    bridgeId: 'evm-bridge-b',
    bridgeType: 'evm',
    sourceChain: 'stellar',
    destinationChain: 'polygon',
    feeUsd: 0.9,
  });
}

describe('StellarEvmFeeComparisonEngine', () => {
  let engine: StellarEvmFeeComparisonEngine;

  beforeEach(() => {
    engine = new StellarEvmFeeComparisonEngine();
    seed(engine);
  });

  // ─── recordFee ─────────────────────────────────────────────────────────────

  describe('recordFee', () => {
    it('throws when bridgeId is empty', () => {
      expect(() =>
        engine.recordFee({
          bridgeId: '',
          bridgeType: 'stellar',
          sourceChain: 'stellar',
          destinationChain: 'ethereum',
          feeUsd: 1,
        }),
      ).toThrow('bridgeId must be a non-empty string');
    });

    it('throws when feeUsd is negative', () => {
      expect(() =>
        engine.recordFee({
          bridgeId: 'b',
          bridgeType: 'evm',
          sourceChain: 'stellar',
          destinationChain: 'ethereum',
          feeUsd: -1,
        }),
      ).toThrow('feeUsd must be non-negative');
    });

    it('normalises chain names to lower-case', () => {
      engine.recordFee({
        bridgeId: 'b',
        bridgeType: 'stellar',
        sourceChain: 'Stellar',
        destinationChain: 'Ethereum',
        feeUsd: 0.3,
      });
      const result = engine.compareFees('stellar', 'ethereum');
      expect(result.sampleCount).toBeGreaterThan(4);
    });

    it('increments totalRecords after each call', () => {
      const before = engine.totalRecords;
      engine.recordFee({
        bridgeId: 'b',
        bridgeType: 'evm',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        feeUsd: 1,
      });
      expect(engine.totalRecords).toBe(before + 1);
    });
  });

  // ─── compareFees ───────────────────────────────────────────────────────────

  describe('compareFees', () => {
    it('returns results ranked cheapest first', () => {
      const result = engine.compareFees('stellar', 'ethereum');
      expect(result.rankedBridges[0].bridgeId).toBe('stellar-bridge-a');
      expect(result.rankedBridges[1].bridgeId).toBe('evm-bridge-b');
    });

    it('assigns rank 1 to the cheapest bridge', () => {
      const { rankedBridges } = engine.compareFees('stellar', 'ethereum');
      expect(rankedBridges[0].rank).toBe(1);
      expect(rankedBridges[1].rank).toBe(2);
    });

    it('sets cheapest and mostExpensive correctly', () => {
      const result = engine.compareFees('stellar', 'ethereum');
      expect(result.cheapest!.bridgeId).toBe('stellar-bridge-a');
      expect(result.mostExpensive!.bridgeId).toBe('evm-bridge-b');
    });

    it('returns sampleCount equal to matching records', () => {
      const result = engine.compareFees('stellar', 'ethereum');
      expect(result.sampleCount).toBe(4);
    });

    it('returns empty result for unknown route', () => {
      const result = engine.compareFees('stellar', 'bsc');
      expect(result.rankedBridges).toHaveLength(0);
      expect(result.cheapest).toBeNull();
      expect(result.sampleCount).toBe(0);
    });

    it('respects the windowDays override', () => {
      // Record an old entry outside any reasonable window
      const old = new Date();
      old.setDate(old.getDate() - 30);
      engine.recordFee({
        bridgeId: 'old-bridge',
        bridgeType: 'evm',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        feeUsd: 100,
        timestamp: old,
      });
      // With a 7-day window the old record should not appear
      const result = engine.compareFees('stellar', 'ethereum', 7);
      const ids = result.rankedBridges.map((b) => b.bridgeId);
      expect(ids).not.toContain('old-bridge');
    });
  });

  // ─── getCheapestRoute ──────────────────────────────────────────────────────

  describe('getCheapestRoute', () => {
    it('returns the cheapest bridge entry', () => {
      const cheapest = engine.getCheapestRoute('stellar', 'ethereum');
      expect(cheapest).not.toBeNull();
      expect(cheapest!.bridgeId).toBe('stellar-bridge-a');
      expect(cheapest!.rank).toBe(1);
    });

    it('returns null when no data exists', () => {
      expect(engine.getCheapestRoute('stellar', 'arbitrum')).toBeNull();
    });
  });

  // ─── rankAllBridgesByCost ──────────────────────────────────────────────────

  describe('rankAllBridgesByCost', () => {
    it('returns entries sorted by average fee ascending', () => {
      const ranked = engine.rankAllBridgesByCost();
      for (let i = 1; i < ranked.length; i++) {
        expect(ranked[i].averageFeeUsd).toBeGreaterThanOrEqual(
          ranked[i - 1].averageFeeUsd,
        );
      }
    });

    it('includes both stellar and evm bridge types', () => {
      const types = engine.rankAllBridgesByCost().map((e) => e.bridgeType);
      expect(types).toContain('stellar');
      expect(types).toContain('evm');
    });
  });

  // ─── aggregateFeesByBridge ─────────────────────────────────────────────────

  describe('aggregateFeesByBridge', () => {
    it('returns a Map keyed by bridgeId', () => {
      const map = engine.aggregateFeesByBridge();
      expect(map instanceof Map).toBe(true);
      expect(map.has('stellar-bridge-a')).toBe(true);
      expect(map.has('evm-bridge-b')).toBe(true);
    });

    it('stores numeric average fee values', () => {
      const map = engine.aggregateFeesByBridge();
      map.forEach((fee) => {
        expect(typeof fee).toBe('number');
        expect(fee).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ─── pruneOlderThan ────────────────────────────────────────────────────────

  describe('pruneOlderThan', () => {
    it('removes records older than the given days', () => {
      const old = new Date();
      old.setDate(old.getDate() - 10);
      engine.recordFee({
        bridgeId: 'old-b',
        bridgeType: 'evm',
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        feeUsd: 5,
        timestamp: old,
      });
      const removed = engine.pruneOlderThan(7);
      expect(removed).toBeGreaterThanOrEqual(1);
    });
  });

  // ─── clearRecords ──────────────────────────────────────────────────────────

  describe('clearRecords', () => {
    it('resets totalRecords to zero', () => {
      engine.clearRecords();
      expect(engine.totalRecords).toBe(0);
    });
  });

  // ─── maxRecordsPerBridge ───────────────────────────────────────────────────

  describe('maxRecordsPerBridge option', () => {
    it('caps stored records per bridge', () => {
      const capped = new StellarEvmFeeComparisonEngine({
        maxRecordsPerBridge: 2,
      });
      for (let i = 0; i < 5; i++) {
        capped.recordFee({
          bridgeId: 'b',
          bridgeType: 'evm',
          sourceChain: 'stellar',
          destinationChain: 'ethereum',
          feeUsd: i,
        });
      }
      expect(capped.totalRecords).toBe(2);
    });
  });
});
