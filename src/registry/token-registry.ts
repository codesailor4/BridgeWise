// ─── Types ────────────────────────────────────────────────────────────────────

export interface TokenMetadata {
  /** Token symbol, e.g. "USDC". Stored and looked up in uppercase. */
  symbol: string;
  /** Human-readable name, e.g. "USD Coin". */
  name: string;
  /** Number of decimal places used by the token's smallest unit. */
  decimals: number;
  /** Optional logo image URI. */
  logoURI?: string;
  /** Contract addresses keyed by numeric chain ID. */
  addresses: Record<number, string>;
  /** Optional tags for categorisation, e.g. ["stablecoin", "erc20"]. */
  tags?: string[];
}

export interface HumanAmount {
  /** Whole-number part as a string. */
  whole: string;
  /** Fractional part without trailing zeroes, or "" when the amount is exact. */
  fraction: string;
  /** Formatted string combining both parts, e.g. "1.5" or "42". */
  formatted: string;
}

export interface RegistryStats {
  totalTokens: number;
  totalChainIds: number[];
}

// ─── Errors ───────────────────────────────────────────────────────────────────

export class UnknownTokenError extends Error {
  constructor(symbol: string) {
    super(`Unknown token: "${symbol}"`);
    this.name = "UnknownTokenError";
  }
}

export class TokenRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TokenRegistrationError";
  }
}

// ─── Registry ─────────────────────────────────────────────────────────────────

/**
 * Central registry for cross-chain token metadata.
 *
 * Keys are always uppercased symbols. All mutating methods validate their input
 * and throw typed errors so callers can handle specific failure modes without
 * parsing message strings.
 */
export class TokenRegistry {
  private readonly tokens: Map<string, TokenMetadata> = new Map();

  // ─── Registration ──────────────────────────────────────────────────────

  /**
   * Register a single token, replacing any existing entry with the same symbol.
   *
   * @throws `TokenRegistrationError` if the symbol is blank, decimals are out
   *   of range, or a chain address is not a non-empty string.
   */
  register(token: TokenMetadata): void {
    this.validateToken(token);
    const key = token.symbol.toUpperCase();
    this.tokens.set(key, { ...token, symbol: key });
  }

  /**
   * Register multiple tokens. All tokens are validated before any are written,
   * so the registry is never left in a partial state on a batch error.
   *
   * @throws `TokenRegistrationError` if any token fails validation.
   */
  registerBatch(tokens: TokenMetadata[]): void {
    for (const token of tokens) this.validateToken(token);
    for (const token of tokens) this.register(token);
  }

  /**
   * Merge `addresses` from `incoming` into an existing token entry.
   * Existing chain entries are overwritten; others are preserved.
   *
   * @throws `UnknownTokenError` if the symbol is not already registered.
   */
  mergeAddresses(symbol: string, addresses: Record<number, string>): void {
    const existing = this.getOrThrow(symbol);
    this.tokens.set(existing.symbol, {
      ...existing,
      addresses: { ...existing.addresses, ...addresses },
    });
  }

  /**
   * Remove a token by symbol.
   * Returns `true` if the token existed, `false` otherwise.
   */
  deregister(symbol: string): boolean {
    return this.tokens.delete(symbol.toUpperCase());
  }

  // ─── Lookup ────────────────────────────────────────────────────────────

  /** Look up by symbol. Returns `undefined` when not found. */
  get(symbol: string): TokenMetadata | undefined {
    return this.tokens.get(symbol.toUpperCase());
  }

  /** Look up by symbol and throw `UnknownTokenError` when not found. */
  getOrThrow(symbol: string): TokenMetadata {
    const token = this.get(symbol);
    if (!token) throw new UnknownTokenError(symbol);
    return token;
  }

  /** Look up by contract address on a specific chain (case-insensitive). */
  getByAddress(chainId: number, address: string): TokenMetadata | undefined {
    const normalised = address.toLowerCase();
    for (const token of this.tokens.values()) {
      const tokenAddress = token.addresses[chainId];
      if (tokenAddress?.toLowerCase() === normalised) return token;
    }
    return undefined;
  }

  /** Get the contract address for a specific chain, or `undefined`. */
  getAddress(symbol: string, chainId: number): string | undefined {
    return this.get(symbol)?.addresses[chainId];
  }

  /** Get the contract address or throw if the token or chain entry is missing. */
  getAddressOrThrow(symbol: string, chainId: number): string {
    const token = this.getOrThrow(symbol);
    const address = token.addresses[chainId];
    if (!address) {
      throw new UnknownTokenError(
        `Token "${symbol}" has no address registered for chain ${chainId}`,
      );
    }
    return address;
  }

  has(symbol: string): boolean {
    return this.tokens.has(symbol.toUpperCase());
  }

  // ─── Filtering ─────────────────────────────────────────────────────────

  /** All registered tokens as an array, in registration order. */
  getAll(): TokenMetadata[] {
    return Array.from(this.tokens.values());
  }

  /** Tokens that have an address on the given chain. */
  getForChain(chainId: number): TokenMetadata[] {
    return this.getAll().filter((t) => chainId in t.addresses);
  }

  /** Tokens whose `tags` array includes every tag in `required`. */
  getByTags(...required: string[]): TokenMetadata[] {
    return this.getAll().filter((t) =>
      required.every((tag) => t.tags?.includes(tag)),
    );
  }

  // ─── Amount formatting ─────────────────────────────────────────────────

  /**
   * Convert a raw (smallest-unit) `bigint` amount to a human-readable form.
   *
   * Returns a structured `HumanAmount` so callers can use the parts
   * independently (e.g. rendering whole and fraction in different font sizes)
   * or take the pre-joined `formatted` string.
   *
   * @throws `UnknownTokenError` when the symbol is not registered.
   * @throws `RangeError` when `rawAmount` is negative.
   */
  toHuman(symbol: string, rawAmount: bigint): HumanAmount {
    if (rawAmount < 0n) {
      throw new RangeError(`rawAmount must be non-negative, received ${rawAmount}`);
    }

    const token = this.getOrThrow(symbol);
    const divisor = 10n ** BigInt(token.decimals);
    const whole = (rawAmount / divisor).toString();
    const remainder = rawAmount % divisor;

    if (remainder === 0n) {
      return { whole, fraction: "", formatted: whole };
    }

    const fraction = remainder
      .toString()
      .padStart(token.decimals, "0")
      .replace(/0+$/, "");

    return { whole, fraction, formatted: `${whole}.${fraction}` };
  }

  /**
   * Convert a human-readable amount string back to a raw `bigint`.
   *
   * Accepts strings like `"1"`, `"1.5"`, `"0.000001"`.
   *
   * @throws `UnknownTokenError` when the symbol is not registered.
   * @throws `RangeError`        when the string is not a valid decimal number
   *   or has more decimal places than the token supports.
   */
  toRaw(symbol: string, humanAmount: string): bigint {
    const token = this.getOrThrow(symbol);

    if (!/^\d+(\.\d+)?$/.test(humanAmount)) {
      throw new RangeError(
        `Invalid amount "${humanAmount}" — expected a non-negative decimal string`,
      );
    }

    const [wholePart, fracPart = ""] = humanAmount.split(".");

    if (fracPart.length > token.decimals) {
      throw new RangeError(
        `Amount "${humanAmount}" has ${fracPart.length} decimal places but ` +
        `${symbol} only supports ${token.decimals}`,
      );
    }

    const paddedFrac = fracPart.padEnd(token.decimals, "0");
    return BigInt(wholePart) * 10n ** BigInt(token.decimals) + BigInt(paddedFrac);
  }

  // ─── Introspection ─────────────────────────────────────────────────────

  get size(): number {
    return this.tokens.size;
  }

  /** Summary statistics about the registry's current contents. */
  stats(): RegistryStats {
    const chainIdSet = new Set<number>();
    for (const token of this.tokens.values()) {
      for (const id of Object.keys(token.addresses)) {
        chainIdSet.add(Number(id));
      }
    }
    return {
      totalTokens: this.tokens.size,
      totalChainIds: [...chainIdSet].sort((a, b) => a - b),
    };
  }

  // ─── Private validation ────────────────────────────────────────────────

  private validateToken(token: TokenMetadata): void {
    if (!token.symbol?.trim()) {
      throw new TokenRegistrationError("Token symbol must be a non-empty string");
    }
    if (!token.name?.trim()) {
      throw new TokenRegistrationError(
        `Token "${token.symbol}": name must be a non-empty string`,
      );
    }
    if (!Number.isInteger(token.decimals) || token.decimals < 0 || token.decimals > 77) {
      throw new TokenRegistrationError(
        `Token "${token.symbol}": decimals must be an integer between 0 and 77, ` +
        `received ${token.decimals}`,
      );
    }
    for (const [chainId, address] of Object.entries(token.addresses)) {
      if (!address?.trim()) {
        throw new TokenRegistrationError(
          `Token "${token.symbol}": address for chain ${chainId} must be a non-empty string`,
        );
      }
    }
  }
}

// ─── Default registry ─────────────────────────────────────────────────────────

/** Pre-loaded registry with common cross-chain tokens. Import and extend as needed. */
export const defaultTokenRegistry = new TokenRegistry();

defaultTokenRegistry.registerBatch([
  {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://assets.coingecko.com/coins/images/6319/small/USD_Coin_icon.png",
    tags: ["stablecoin", "erc20"],
    addresses: {
      1:   "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
      137: "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174", // Polygon
      56:  "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BNB Chain
    },
  },
  {
    symbol: "USDT",
    name: "Tether USD",
    decimals: 6,
    logoURI: "https://assets.coingecko.com/coins/images/325/small/Tether.png",
    tags: ["stablecoin", "erc20"],
    addresses: {
      1:   "0xdAC17F958D2ee523a2206206994597C13D831ec7", // Ethereum
      137: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F", // Polygon
    },
  },
  {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    tags: ["native"],
    addresses: {
      1: "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE", // canonical native placeholder
    },
  },
  {
    symbol: "XLM",
    name: "Stellar Lumens",
    decimals: 7,
    tags: ["native"],
    addresses: {},
  },
]);