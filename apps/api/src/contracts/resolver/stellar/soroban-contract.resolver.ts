/**
 * Soroban Contract Address Resolver
 *
 * Resolves and validates Soroban smart contract addresses on the Stellar network.
 * Supports strkey (C...) and hex-encoded contract IDs.
 *
 * Features:
 * - Address format detection and validation
 * - On-chain existence verification via Soroban RPC
 * - In-memory caching with TTL
 * - Batch resolution
 * - Multi-network support (mainnet, testnet, futurenet)
 */

import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { StellarAdapterException } from '../../../common/exceptions/app.exception';
import { SOROBAN_RESOLVER_ERROR_CODES } from '../../../common/constants/error-codes';
import {
  SorobanNetwork,
  ContractAddressFormat,
  ResolvedContract,
  ContractCacheEntry,
  ResolveOptions,
  BatchResolveRequest,
  BatchResolveResult,
} from './soroban-contract.types';
import {
  validateContractAddress,
  normalizeAddress,
  detectAddressFormat,
} from './soroban-contract.validator';

/** Cache TTL: 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Soroban RPC endpoints per network */
const RPC_ENDPOINTS: Record<SorobanNetwork, string> = {
  [SorobanNetwork.MAINNET]: 'https://mainnet.stellar.validationcloud.io/v1/soroban/rpc',
  [SorobanNetwork.TESTNET]: 'https://soroban-testnet.stellar.org',
  [SorobanNetwork.FUTURENET]: 'https://rpc-futurenet.stellar.org',
};

@Injectable()
export class SorobanContractResolver {
  private readonly logger = new Logger(SorobanContractResolver.name);
  private readonly cache = new Map<string, ContractCacheEntry>();

  constructor(private readonly httpService: HttpService) {}

  /**
   * Resolves a single Soroban contract address.
   * Validates format, normalizes, and optionally verifies on-chain existence.
   */
  async resolve(
    address: string,
    options: ResolveOptions = {},
  ): Promise<ResolvedContract> {
    const {
      network = SorobanNetwork.MAINNET,
      verifyOnChain = true,
      bypassCache = false,
    } = options;

    const validation = validateContractAddress(address);
    if (!validation.isValid) {
      throw new StellarAdapterException(
        SOROBAN_RESOLVER_ERROR_CODES.SOROBAN_INVALID_CONTRACT_ADDRESS,
        `Invalid Soroban contract address: ${validation.error}`,
        { address, error: validation.error },
      );
    }

    const contractId = normalizeAddress(address, validation.format!);
    const cacheKey = `${network}:${contractId}`;

    if (!bypassCache) {
      const cached = this.getFromCache(cacheKey);
      if (cached) {
        this.logger.debug(`Cache hit for contract ${contractId} on ${network}`);
        return cached;
      }
    }

    let exists = false;
    let wasmHash: string | undefined;
    let ledger: number | undefined;

    if (verifyOnChain) {
      const onChainData = await this.fetchContractOnChain(contractId, network);
      exists = onChainData.exists;
      wasmHash = onChainData.wasmHash;
      ledger = onChainData.ledger;
    }

    const resolved: ResolvedContract = {
      rawAddress: address,
      contractId,
      network,
      format: validation.format!,
      exists,
      wasmHash,
      ledger,
      resolvedAt: new Date(),
    };

    this.setCache(cacheKey, resolved);
    return resolved;
  }

  /**
   * Validates a contract address without on-chain lookup.
   * Fast, synchronous check of address format only.
   */
  validate(address: string) {
    return validateContractAddress(address);
  }

  /**
   * Resolves multiple contract addresses in parallel.
   */
  async resolveBatch(request: BatchResolveRequest): Promise<BatchResolveResult> {
    const { addresses, options } = request;
    const result: BatchResolveResult = { resolved: [], failed: [] };

    await Promise.allSettled(
      addresses.map(async (address) => {
        try {
          const resolved = await this.resolve(address, options);
          result.resolved.push(resolved);
        } catch (error) {
          result.failed.push({
            address,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );

    return result;
  }

  /**
   * Returns the Soroban RPC endpoint for a given network.
   */
  getRpcEndpoint(network: SorobanNetwork): string {
    return RPC_ENDPOINTS[network];
  }

  /**
   * Clears the resolver cache. Useful for testing or forced refresh.
   */
  clearCache(): void {
    this.cache.clear();
    this.logger.debug('Contract resolver cache cleared');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Queries the Soroban RPC to check if a contract exists on-chain.
   * Uses the getLedgerEntries RPC method with a ContractData key.
   */
  private async fetchContractOnChain(
    contractId: string,
    network: SorobanNetwork,
  ): Promise<{ exists: boolean; wasmHash?: string; ledger?: number }> {
    const endpoint = RPC_ENDPOINTS[network];

    try {
      const payload = {
        jsonrpc: '2.0',
        id: 1,
        method: 'getContractData',
        params: {
          contract: contractId,
          key: 'AAAAAA==', // XDR for Void (contract instance key)
          durability: 'persistent',
        },
      };

      const response = await firstValueFrom(
        this.httpService.post(endpoint, payload, {
          headers: { 'Content-Type': 'application/json' },
          timeout: 8000,
        }),
      );

      const rpcResult = response.data?.result;

      if (!rpcResult || response.data?.error) {
        // RPC error code -32600 / not found means contract doesn't exist
        return { exists: false };
      }

      return {
        exists: true,
        wasmHash: rpcResult.entry?.contractData?.val?.instance?.executable?.wasmHash,
        ledger: rpcResult.latestLedger,
      };
    } catch (error) {
      // Network errors or timeouts — log and return unknown existence
      this.logger.warn(
        `On-chain lookup failed for ${contractId} on ${network}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Return exists: false rather than throwing — caller gets a resolved object
      // with exists=false, which is more useful than an exception for batch ops
      return { exists: false };
    }
  }

  private getFromCache(key: string): ResolvedContract | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
      this.cache.delete(key);
      return null;
    }
    return entry.resolved;
  }

  private setCache(key: string, resolved: ResolvedContract): void {
    this.cache.set(key, { resolved, cachedAt: Date.now() });
  }
}
