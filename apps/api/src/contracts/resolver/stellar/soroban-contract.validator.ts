/**
 * Soroban Contract Address Validator
 *
 * Validates Soroban contract addresses using Stellar strkey encoding rules.
 * Soroban contract addresses use the 'C' prefix in strkey format.
 *
 * Strkey spec: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0023.md
 */

import {
  ContractAddressFormat,
  ContractValidationResult,
} from './soroban-contract.types';

/** Soroban contract strkey prefix character */
const STRKEY_CONTRACT_PREFIX = 'C';

/** Strkey alphabet (base32 without padding) */
const STRKEY_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Expected length of a strkey-encoded contract address */
const STRKEY_CONTRACT_LENGTH = 56;

/** Expected length of a hex-encoded contract ID (32 bytes = 64 hex chars) */
const HEX_CONTRACT_LENGTH = 64;

/**
 * Validates a strkey-encoded Soroban contract address.
 * Contract addresses start with 'C' and are 56 characters long.
 */
function isValidStrkey(address: string): boolean {
  if (!address || address.length !== STRKEY_CONTRACT_LENGTH) return false;
  if (address[0] !== STRKEY_CONTRACT_PREFIX) return false;

  for (const char of address) {
    if (!STRKEY_ALPHABET.includes(char)) return false;
  }

  return true;
}

/**
 * Validates a hex-encoded contract ID (32 bytes).
 */
function isValidHex(address: string): boolean {
  const cleaned = address.startsWith('0x') ? address.slice(2) : address;
  if (cleaned.length !== HEX_CONTRACT_LENGTH) return false;
  return /^[0-9a-fA-F]+$/.test(cleaned);
}

/**
 * Detects the format of a contract address.
 * Returns null if the format cannot be determined.
 */
export function detectAddressFormat(
  address: string,
): ContractAddressFormat | null {
  if (!address) return null;

  const trimmed = address.trim();

  if (isValidStrkey(trimmed)) return ContractAddressFormat.STRKEY;
  if (isValidHex(trimmed)) return ContractAddressFormat.HEX;

  return null;
}

/**
 * Validates a Soroban contract address and returns a structured result.
 */
export function validateContractAddress(
  address: string,
): ContractValidationResult {
  if (!address || typeof address !== 'string') {
    return {
      address: address ?? '',
      isValid: false,
      error: 'Address must be a non-empty string',
    };
  }

  const trimmed = address.trim();
  const format = detectAddressFormat(trimmed);

  if (!format) {
    return {
      address: trimmed,
      isValid: false,
      error:
        'Invalid contract address format. Expected a 56-character strkey (C...) or 64-character hex string',
    };
  }

  return {
    address: trimmed,
    isValid: true,
    format,
  };
}

/**
 * Normalizes a contract address to strkey format.
 * Hex addresses are converted to uppercase without 0x prefix.
 * Strkey addresses are returned as-is (already normalized).
 *
 * Note: Full hex-to-strkey conversion requires the Stellar SDK.
 * This function returns the canonical form for each format.
 */
export function normalizeAddress(
  address: string,
  format: ContractAddressFormat,
): string {
  if (format === ContractAddressFormat.HEX) {
    return address.startsWith('0x')
      ? address.slice(2).toUpperCase()
      : address.toUpperCase();
  }
  return address.trim().toUpperCase();
}
