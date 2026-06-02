export type TransferDirection = 'unidirectional' | 'bidirectional';

export interface ChainPair {
  sourceChain: string;
  targetChain: string;
}

export interface CompatibilityEntry extends ChainPair {
  supported: boolean;
  direction: TransferDirection;
  supportedAssets: string[];
  addedAt: number;
}

export interface CompatibilityQuery extends ChainPair {
  asset?: string;
}

export interface CompatibilityQueryResult {
  supported: boolean;
  entry: CompatibilityEntry | null;
}
