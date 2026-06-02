import {
  CompatibilityEntry,
  CompatibilityQuery,
  CompatibilityQueryResult,
  ChainPair,
  TransferDirection,
} from './soroban-compatibility-matrix.types';

/**
 * Tracks which chain pairs are supported for Soroban ↔ EVM bridge transfers
 * and exposes query APIs so callers can validate routes before attempting them.
 *
 * Entries are keyed by a canonical `<source>:<target>` string. Bidirectional
 * pairs are stored once and matched in either direction.
 *
 * Usage:
 *   const matrix = new SorobanCompatibilityMatrix();
 *   matrix.add({ sourceChain: 'stellar', targetChain: 'ethereum', direction: 'bidirectional', supportedAssets: ['USDC'] });
 *   matrix.isSupported({ sourceChain: 'stellar', targetChain: 'ethereum' }); // true
 */
export class SorobanCompatibilityMatrix {
  private readonly entries = new Map<string, CompatibilityEntry>();
  private readonly now: () => number;

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  // ─── Mutation ─────────────────────────────────────────────────────────────

  /**
   * Add or replace a chain-pair compatibility entry.
   *
   * When an entry for the same key already exists it is overwritten so the
   * matrix stays up-to-date without manual removal.
   */
  add(
    pair: ChainPair & {
      direction: TransferDirection;
      supportedAssets: string[];
      supported?: boolean;
    },
  ): void {
    const key = this.key(pair.sourceChain, pair.targetChain);
    this.entries.set(key, {
      sourceChain: pair.sourceChain,
      targetChain: pair.targetChain,
      supported: pair.supported ?? true,
      direction: pair.direction,
      supportedAssets: [...pair.supportedAssets],
      addedAt: this.now(),
    });
  }

  /** Remove a chain-pair entry. Returns `true` if it existed. */
  remove(pair: ChainPair): boolean {
    const key = this.key(pair.sourceChain, pair.targetChain);
    if (this.entries.delete(key)) return true;

    // Try reverse key for bidirectional entries stored in the opposite order
    const reverseKey = this.key(pair.targetChain, pair.sourceChain);
    return this.entries.delete(reverseKey);
  }

  // ─── Query ────────────────────────────────────────────────────────────────

  /**
   * Check whether a transfer combination is supported.
   *
   * For bidirectional entries the direction of the query is irrelevant —
   * both `(A → B)` and `(B → A)` return the same entry.
   *
   * If an `asset` is provided the entry must also list it in `supportedAssets`.
   */
  query(q: CompatibilityQuery): CompatibilityQueryResult {
    const entry = this.findEntry(q.sourceChain, q.targetChain);

    if (!entry || !entry.supported) {
      return { supported: false, entry: null };
    }

    if (q.asset && !entry.supportedAssets.includes(q.asset)) {
      return { supported: false, entry };
    }

    return { supported: true, entry };
  }

  /** Convenience boolean wrapper around `query`. */
  isSupported(q: CompatibilityQuery): boolean {
    return this.query(q).supported;
  }

  /** All currently registered entries. */
  getAll(): CompatibilityEntry[] {
    return [...this.entries.values()];
  }

  /**
   * All entries where `chain` appears as either source or target,
   * sorted alphabetically by the partner chain name.
   */
  getForChain(chain: string): CompatibilityEntry[] {
    return this.getAll()
      .filter(
        (e) =>
          e.sourceChain === chain ||
          (e.direction === 'bidirectional' && e.targetChain === chain),
      )
      .sort((a, b) => {
        const partnerA =
          a.sourceChain === chain ? a.targetChain : a.sourceChain;
        const partnerB =
          b.sourceChain === chain ? b.targetChain : b.sourceChain;
        return partnerA.localeCompare(partnerB);
      });
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private key(source: string, target: string): string {
    return `${source}:${target}`;
  }

  private findEntry(
    source: string,
    target: string,
  ): CompatibilityEntry | undefined {
    return (
      this.entries.get(this.key(source, target)) ??
      this.entries.get(this.key(target, source))
    );
  }
}
