// ─── Shared Transfer Types ────────────────────────────────────────────────────

export interface AdapterTransferRequest {
  sourceChain: string;
  targetChain: string;
  sourceAmount: string;
  recipient: string;
  asset?: string;
  tokenAddress?: string;
}

export interface AdapterTransferOptions {
  slippage?: number;
  deadline?: number;
  gasLimit?: number;
  priorityFee?: string;
}

export interface AdapterTransferResult {
  success: boolean;
  transactionHash?: string;
  operationId?: string;
  bridgedAmount?: string;
  estimatedTimeMs?: number;
  error?: string;
}

export type AdapterTransferStatus = 'pending' | 'confirmed' | 'failed';

export interface AdapterTransferStatusResult {
  operationId: string;
  status: AdapterTransferStatus;
  transactionHash?: string;
  bridgedAmount?: string;
  estimatedTimeMs?: number;
}

// ─── Fee Types ────────────────────────────────────────────────────────────────

export interface AdapterFeeEstimate {
  networkFee: string;
  bridgeFee: string;
  totalFee: string;
  feePercentage?: string;
  gasEstimate?: string;
}

// ─── Network Types ────────────────────────────────────────────────────────────

export interface AdapterNetworkStats {
  baseFee: number;
  averageTimeMs: number;
  pendingTransactions: number;
}

// ─── Adapter Metadata ─────────────────────────────────────────────────────────

export interface AdapterInfo {
  name: string;
  version: string;
  network: 'mainnet' | 'testnet';
  supportedSourceChains: string[];
  supportedDestinationChains: string[];
}

// ─── Base Bridge Adapter Interface ───────────────────────────────────────────

/**
 * Generic bridge adapter interface that all bridge implementations must satisfy.
 * Provides a uniform API for connecting wallets, executing transfers, estimating
 * fees and querying transfer status regardless of the underlying bridge provider.
 */
export interface IBridgeAdapter {
  /**
   * Establish a connection to the user's wallet on the specified network.
   */
  connect(network: 'mainnet' | 'testnet'): Promise<void>;

  /**
   * Release any resources associated with the current wallet connection.
   */
  disconnect(): void;

  /**
   * Returns true if a wallet connection is currently active.
   */
  isConnected(): boolean;

  /**
   * Execute a cross-chain bridge transfer.
   */
  executeTransfer(
    transfer: AdapterTransferRequest,
    options?: AdapterTransferOptions,
  ): Promise<AdapterTransferResult>;

  /**
   * Estimate the fees required for a cross-chain transfer without executing it.
   */
  estimateFees(transfer: AdapterTransferRequest): Promise<AdapterFeeEstimate>;

  /**
   * Query the current status of a previously submitted transfer.
   */
  getTransferStatus(operationId: string): Promise<AdapterTransferStatusResult>;
}

// ─── Soroban-Specific Bridge Adapter Interface ────────────────────────────────

/**
 * Soroban bridge adapter interface extending the base adapter with
 * Soroban/Stellar-specific capabilities.
 *
 * Implementations of this interface provide a standardised, reusable entry
 * point for any Soroban-based bridge integration within the BridgeWise
 * monorepo.
 */
export interface ISorobanBridgeAdapter extends IBridgeAdapter {
  /**
   * Fetch current Stellar network statistics useful for fee and timing
   * estimates (base fee, average confirmation time, pending queue depth).
   */
  getNetworkStats(): Promise<AdapterNetworkStats>;

  /**
   * Return static metadata describing this adapter instance (name, version,
   * target network, supported chain pairs).
   */
  getAdapterInfo(): AdapterInfo;
}
