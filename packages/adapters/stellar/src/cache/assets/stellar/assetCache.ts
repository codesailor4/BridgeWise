/**
 * Cache for verified Soroban asset metadata to reduce latency from repeated verification requests.
 */
export interface AssetMetadata {
  /** Asset identifier (e.g., contract address for Soroban assets) */
  id: string;
  /** Asset code (e.g., USDC, USDT) */
  code: string;
  /** Asset issuer (for credited assets) */
  issuer?: string;
  /** Whether the asset is native (XLM) */
  isNative: boolean;
  /** Number of decimals */
  decimals: number;
  /** Additional metadata from verification */
  [key: string]: any;
}

/**
 * In-memory cache with TTL support for asset metadata.
 */
export class AssetCache {
  private cache: Map<string, { value: AssetMetadata; expiry: number }>;
  private defaultTTL: number; // in milliseconds

  /**
   * Initialize asset cache.
   * @param defaultTTLInSeconds Default time-to-live for cached items in seconds (default: 300s = 5 minutes)
   */
  constructor(defaultTTLInSeconds: number = 300) {
    this.cache = new Map();
    this.defaultTTL = defaultTTLInSeconds * 1000;
  }

  /**
   * Get asset metadata from cache if present and not expired.
   * @param assetId Asset identifier (contract address or asset code+issuer)
   * @returns Cached asset metadata or null if not found/expired
   */
  get(assetId: string): AssetMetadata | null {
    const item = this.cache.get(assetId);
    if (!item) {
      return null;
    }
    if (Date.now() > item.expiry) {
      this.cache.delete(assetId);
      return null;
    }
    return item.value;
  }

  /**
   * Store asset metadata in cache with TTL.
   * @param assetId Asset identifier
   * @param metadata Asset metadata to cache
   * @param ttlInSeconds Optional custom TTL in seconds (uses default if not provided)
   */
  set(assetId: string, metadata: AssetMetadata, ttlInSeconds?: number): void {
    const ttl = ttlInSeconds ? ttlInSeconds * 1000 : this.defaultTTL;
    const expiry = Date.now() + ttl;
    this.cache.set(assetId, { value: metadata, expiry });
  }

  /**
   * Invalidate (remove) a specific asset from cache.
   * @param assetId Asset identifier to remove
   */
  invalidate(assetId: string): void {
    this.cache.delete(assetId);
  }

  /**
   * Clear all cached assets.
   */
  invalidateAll(): void {
    this.cache.clear();
  }

  /**
   * Get the number of items currently in cache.
   * @returns Number of cached items
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Check if an asset is present in cache (without checking expiry).
   * @param assetId Asset identifier
   * @returns True if asset exists in cache (regardless of expiry)
   */
  has(assetId: string): boolean {
    return this.cache.has(assetId);
  }

  /**
   * Peek at cached asset without updating expiration.
   * @param assetId Asset identifier
   * @returns Cached asset metadata or null if not found
   */
  peek(assetId: string): AssetMetadata | null {
    const item = this.cache.get(assetId);
    if (!item) {
      return null;
    }
    return item.value;
  }
}