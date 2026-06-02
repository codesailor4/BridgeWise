/**
 * Soroban Contract Address Resolver - Type Definitions
 *
 * Types for resolving and validating Soroban smart contract addresses
 * on the Stellar network.
 */

/** Soroban network environments */
export enum SorobanNetwork {
  MAINNET = 'mainnet',
  TESTNET = 'testnet',
  FUTURENET = 'futurenet',
}

/** Contract address format types */
export enum ContractAddressFormat {
  /** Strkey-encoded contract address (C...) */
  STRKEY = 'strkey',
  /** Raw hex-encoded contract ID */
  HEX = 'hex',
}

/** Resolved contract information */
export interface ResolvedContract {
  /** Original address as provided */
  rawAddress: string;
  /** Normalized strkey-encoded contract address */
  contractId: string;
  /** Network the contract belongs to */
  network: SorobanNetwork;
  /** Detected address format */
  format: ContractAddressFormat;
  /** Whether the contract exists on-chain */
  exists: boolean;
  /** Contract WASM hash if available */
  wasmHash?: string;
  /** Ledger sequence when contract was last seen */
  ledger?: number;
  /** Timestamp of resolution */
  resolvedAt: Date;
}

/** Validation result for a contract address */
export interface ContractValidationResult {
  /** The address that was validated */
  address: string;
  /** Whether the address is structurally valid */
  isValid: boolean;
  /** Detected format */
  format?: ContractAddressFormat;
  /** Validation error message if invalid */
  error?: string;
}

/** Cache entry for resolved contracts */
export interface ContractCacheEntry {
  resolved: ResolvedContract;
  cachedAt: number;
}

/** Options for contract resolution */
export interface ResolveOptions {
  /** Network to resolve against (defaults to mainnet) */
  network?: SorobanNetwork;
  /** Whether to verify existence on-chain (defaults to true) */
  verifyOnChain?: boolean;
  /** Whether to bypass cache (defaults to false) */
  bypassCache?: boolean;
}

/** Batch resolution request */
export interface BatchResolveRequest {
  addresses: string[];
  options?: ResolveOptions;
}

/** Batch resolution result */
export interface BatchResolveResult {
  resolved: ResolvedContract[];
  failed: Array<{ address: string; error: string }>;
}
