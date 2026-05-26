import axios from 'axios';
import { Buffer } from 'buffer';
import { AssetCache, AssetMetadata } from '../cache/assets/stellar';

export interface BridgeContractConfig {
  contractId: string;
  rpcUrl: string;
  networkPassphrase: string;
}

export interface BridgeOperationParams {
  sourceChain: string;
  targetChain: string;
  amount: string;
  recipient: string;
  tokenAddress?: string;
  slippage?: number;
  deadline?: number;
}

export interface BridgeOperationResult {
  transactionHash: string;
  operationId: string;
  status: 'pending' | 'confirmed' | 'failed';
  bridgeAmount: string;
  estimatedTime: number;
}

export interface SorobanAccount {
  publicKey: string;
  sequenceNumber: string;
  balances?: Array<{ asset: string; balance: string }>;
}

export class BridgeContract {
  private readonly config: BridgeContractConfig;
  private readonly rpcClient: any;
  private readonly assetCache: AssetCache;

  constructor(config: BridgeContractConfig) {
    this.config = config;
    this.rpcClient = axios.create({
      baseURL: config.rpcUrl,
      headers: { 'Content-Type': 'application/json' },
    });
    // Initialize asset cache with 5 minute TTL (300 seconds)
    this.assetCache = new AssetCache(300);
  }

  async prepareBridgeTransfer(
    params: BridgeOperationParams,
    sourceAccount: SorobanAccount,
  ): Promise<Record<string, any>> {
    try {
      const preparedTx = {
        sourceAccount: sourceAccount.publicKey,
        contractId: this.config.contractId,
        operation: 'bridge',
        params: {
          sourceChain: params.sourceChain,
          targetChain: params.targetChain,
          amount: params.amount,
          recipient: params.recipient,
          slippage: params.slippage || 0.005,
        },
        networkPassphrase: this.config.networkPassphrase,
        fee: 100000,
        timebounds: {
          minTime: Math.floor(Date.now() / 1000),
          maxTime: Math.floor(Date.now() / 1000) + 600,
        },
      };
      return preparedTx;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('Failed to prepare bridge transfer: ' + msg);
    }
  }

  async submitBridgeTransfer(
    signedTransaction: string,
  ): Promise<BridgeOperationResult> {
    try {
      const response = await this.rpcClient.post('/transactions', {
        tx: signedTransaction,
      });
      return {
        transactionHash: response.data.hash || response.data.id,
        operationId: response.data.id || 'bridge-' + Date.now(),
        status: 'pending',
        bridgeAmount: response.data.amount || '0',
        estimatedTime: response.data.estimatedTime || 30000,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('Failed to submit bridge transfer: ' + msg);
    }
  }

  /**
   * Verify and cache asset metadata for Soroban assets.
   * This reduces latency by avoiding repeated verification requests.
   * @param assetId Asset identifier (contract address for Soroban assets)
   * @returns Cached or freshly verified asset metadata
   */
  async verifyAndCacheAsset(assetId: string): Promise<AssetMetadata> {
    // Check cache first
    const cachedAsset = this.assetCache.get(assetId);
    if (cachedAsset) {
      return cachedAsset;
    }

    // If not in cache, fetch and verify asset metadata
    // For native asset (XLM), return basic metadata
    if (assetId === 'native') {
      const nativeAsset: AssetMetadata = {
        id: 'native',
        code: 'XLM',
        isNative: true,
        decimals: 7,
      };
      this.assetCache.set('native', nativeAsset);
      return nativeAsset;
    }

    // For credited assets (contract addresses), fetch metadata from Horizon or contract
    try {
      // Attempt to fetch asset details from Horizon /assets endpoint
      // Note: This is a simplified implementation - in production you might want to
      // call the actual Soroban contract to get asset details
      const response = await this.rpcClient.get(
        `/assets?asset_code=&asset_issuer=${assetId}&limit=1`,
      );

      if (
        response.data &&
        response.data._embedded &&
        response.data._embedded.records &&
        response.data._embedded.records.length > 0
      ) {
        const assetRecord = response.data._embedded.records[0];
        const assetMetadata: AssetMetadata = {
          id: assetId,
          code: assetRecord.asset_code || '',
          issuer: assetRecord.asset_issuer,
          isNative: false,
          decimals: 7, // Default for Stellar assets, could be fetched from contract
          ...assetRecord,
        };

        this.assetCache.set(assetId, assetMetadata);
        return assetMetadata;
      }

      // If not found via Horizon, create basic metadata
      const fallbackAsset: AssetMetadata = {
        id: assetId,
        code: 'UNKNOWN',
        issuer: assetId,
        isNative: false,
        decimals: 7,
      };

      this.assetCache.set(assetId, fallbackAsset);
      return fallbackAsset;
    } catch (error) {
      // On error, still cache basic metadata to prevent repeated failed requests
      const errorAsset: AssetMetadata = {
        id: assetId,
        code: 'ERROR',
        issuer: assetId,
        isNative: false,
        decimals: 7,
      };

      // Cache with shorter TTL for error cases (1 minute)
      this.assetCache.set(assetId, errorAsset, 60);
      return errorAsset;
    }
  }

  /**
   * Get cached asset metadata without fetching if not present.
   * @param assetId Asset identifier
   * @returns Cached asset metadata or null if not found
   */
  getCachedAsset(assetId: string): AssetMetadata | null {
    return this.assetCache.get(assetId);
  }

  /**
   * Invalidate cached asset metadata.
   * @param assetId Asset identifier to remove from cache
   */
  invalidateAssetCache(assetId: string): void {
    this.assetCache.invalidate(assetId);
  }

  /**
   * Clear all cached asset metadata.
   */
  invalidateAllAssetCache(): void {
    this.assetCache.invalidateAll();
  }

  async queryBridgeStatus(operationId: string): Promise<BridgeOperationResult> {
    try {
      const url = '/operations/' + operationId;
      const response = await this.rpcClient.get(url);
      const statusMap: Record<string, 'pending' | 'confirmed' | 'failed'> = {
        pending: 'pending',
        confirmed: 'confirmed',
        success: 'confirmed',
        failed: 'failed',
        error: 'failed',
      };
      return {
        transactionHash: response.data.hash,
        operationId: response.data.id,
        status: statusMap[response.data.status] || 'pending',
        bridgeAmount: response.data.bridgeAmount || '0',
        estimatedTime: response.data.estimatedTime || 0,
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('Failed to query bridge status: ' + msg);
    }
  }

  async estimateBridgeFees(
    params: BridgeOperationParams,
  ): Promise<Record<string, string>> {
    try {
      const amount = BigInt(params.amount);
      const baseFee = BigInt(100000);
      const bridgeFee = amount / BigInt(1000);
      const totalFee = baseFee + bridgeFee;
      return {
        baseFee: baseFee.toString(),
        bridgeFee: bridgeFee.toString(),
        totalFee: totalFee.toString(),
        feePercentage: '0.1',
      };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new Error('Failed to estimate bridge fees: ' + msg);
    }
  }

  private createBridgeArgs(params: BridgeOperationParams): Buffer[] {
    const args: Buffer[] = [];
    args.push(Buffer.from(params.sourceChain));
    args.push(Buffer.from(params.targetChain));
    args.push(Buffer.from(params.amount));
    args.push(Buffer.from(params.recipient));
    if (params.tokenAddress) {
      args.push(Buffer.from(params.tokenAddress));
    }
    if (params.slippage !== undefined) {
      args.push(Buffer.from(String(params.slippage)));
    }
    return args;
  }
}
