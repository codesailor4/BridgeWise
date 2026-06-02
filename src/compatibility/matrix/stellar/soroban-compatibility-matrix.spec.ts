import { SorobanCompatibilityMatrix } from './soroban-compatibility-matrix';

describe('SorobanCompatibilityMatrix', () => {
  let matrix: SorobanCompatibilityMatrix;

  beforeEach(() => {
    matrix = new SorobanCompatibilityMatrix(() => 1_000);
  });

  // ─── add / getAll ─────────────────────────────────────────────────────────

  it('adds an entry and stamps addedAt', () => {
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });

    const all = matrix.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].addedAt).toBe(1_000);
  });

  it('overwrites existing entry on re-add', () => {
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'unidirectional', supportedAssets: ['XLM'] });

    expect(matrix.getAll()).toHaveLength(1);
    expect(matrix.getAll()[0].direction).toBe('unidirectional');
  });

  // ─── remove ───────────────────────────────────────────────────────────────

  it('removes an entry', () => {
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });
    expect(matrix.remove({ sourceChain: 'stellar', targetChain: 'ethereum' })).toBe(true);
    expect(matrix.getAll()).toHaveLength(0);
  });

  it('returns false when removing unknown pair', () => {
    expect(matrix.remove({ sourceChain: 'x', targetChain: 'y' })).toBe(false);
  });

  // ─── query / isSupported ──────────────────────────────────────────────────

  it('returns supported=true for a registered pair', () => {
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });

    expect(matrix.isSupported({ sourceChain: 'stellar', targetChain: 'ethereum' })).toBe(true);
  });

  it('matches bidirectional pair in reverse direction', () => {
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });

    expect(matrix.isSupported({ sourceChain: 'ethereum', targetChain: 'stellar' })).toBe(true);
  });

  it('returns supported=false for unknown pair', () => {
    expect(matrix.isSupported({ sourceChain: 'stellar', targetChain: 'arbitrum' })).toBe(false);
  });

  it('returns supported=false when entry.supported is false', () => {
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'], supported: false });

    expect(matrix.isSupported({ sourceChain: 'stellar', targetChain: 'ethereum' })).toBe(false);
  });

  it('filters by asset when asset is provided', () => {
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });

    expect(matrix.isSupported({ sourceChain: 'stellar', targetChain: 'ethereum', asset: 'USDC' })).toBe(true);
    expect(matrix.isSupported({ sourceChain: 'stellar', targetChain: 'ethereum', asset: 'DAI' })).toBe(false);
  });

  it('query returns the entry even when asset is unsupported', () => {
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });

    const result = matrix.query({ sourceChain: 'stellar', targetChain: 'ethereum', asset: 'DAI' });
    expect(result.supported).toBe(false);
    expect(result.entry).not.toBeNull();
  });

  // ─── getForChain ──────────────────────────────────────────────────────────

  it('returns entries where chain is source or bidirectional target', () => {
    matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });
    matrix.add({ sourceChain: 'stellar', targetChain: 'polygon', direction: 'unidirectional', supportedAssets: ['XLM'] });
    matrix.add({ sourceChain: 'arbitrum', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });

    const stellarEntries = matrix.getForChain('stellar');
    expect(stellarEntries.map((e) => e.targetChain).sort()).toEqual(['ethereum', 'polygon']);
  });
});
