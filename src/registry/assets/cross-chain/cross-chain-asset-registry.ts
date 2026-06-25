export interface CrossChainAsset {
  id: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  addresses: Record<string, string>;
  tags?: string[];
}

export interface RegistryStats {
  totalAssets: number;
  totalChains: string[];
  totalRoutes: number;
}

export class UnknownAssetError extends Error {
  constructor(id: string) {
    super(`Unknown cross-chain asset: "${id}"`);
    this.name = 'UnknownAssetError';
  }
}

export class AssetRegistrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AssetRegistrationError';
  }
}

export class CrossChainAssetRegistry {
  private readonly assets = new Map<string, CrossChainAsset>();
  private readonly symbolIndex = new Map<string, Set<string>>();
  private readonly chainIndex = new Map<string, Set<string>>();
  private readonly bridgeRoutes = new Map<string, Set<string>>();

  register(asset: CrossChainAsset): void {
    this.validateAsset(asset);
    const id = asset.id;
    this.assets.set(id, { ...asset });

    const symbolKey = asset.symbol.toUpperCase();
    if (!this.symbolIndex.has(symbolKey)) {
      this.symbolIndex.set(symbolKey, new Set());
    }
    this.symbolIndex.get(symbolKey)!.add(id);

    for (const chainId of Object.keys(asset.addresses)) {
      if (!this.chainIndex.has(chainId)) {
        this.chainIndex.set(chainId, new Set());
      }
      this.chainIndex.get(chainId)!.add(id);
    }
  }

  registerBatch(assets: CrossChainAsset[]): void {
    for (const asset of assets) {
      this.validateAsset(asset);
    }
    for (const asset of assets) {
      this.register(asset);
    }
  }

  deregister(id: string): boolean {
    const asset = this.assets.get(id);
    if (!asset) return false;

    this.assets.delete(id);

    const symbolKey = asset.symbol.toUpperCase();
    this.symbolIndex.get(symbolKey)?.delete(id);
    if (this.symbolIndex.get(symbolKey)?.size === 0) {
      this.symbolIndex.delete(symbolKey);
    }

    for (const chainId of Object.keys(asset.addresses)) {
      this.chainIndex.get(chainId)?.delete(id);
      if (this.chainIndex.get(chainId)?.size === 0) {
        this.chainIndex.delete(chainId);
      }
    }

    for (const [route, assetIds] of this.bridgeRoutes) {
      assetIds.delete(id);
      if (assetIds.size === 0) {
        this.bridgeRoutes.delete(route);
      }
    }

    return true;
  }

  get(id: string): CrossChainAsset | undefined {
    return this.assets.get(id);
  }

  getOrThrow(id: string): CrossChainAsset {
    const asset = this.get(id);
    if (!asset) throw new UnknownAssetError(id);
    return asset;
  }

  getBySymbol(symbol: string): CrossChainAsset[] {
    const ids = this.symbolIndex.get(symbol.toUpperCase());
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.assets.get(id)!)
      .filter(Boolean);
  }

  getByChain(chainId: string): CrossChainAsset[] {
    const ids = this.chainIndex.get(chainId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.assets.get(id)!)
      .filter(Boolean);
  }

  getAddress(id: string, chainId: string): string | undefined {
    return this.assets.get(id)?.addresses[chainId];
  }

  getAddressOrThrow(id: string, chainId: string): string {
    const asset = this.getOrThrow(id);
    const address = asset.addresses[chainId];
    if (!address) {
      throw new UnknownAssetError(
        `Asset "${id}" has no address registered for chain "${chainId}"`,
      );
    }
    return address;
  }

  has(id: string): boolean {
    return this.assets.has(id);
  }

  addBridgeableRoute(assetId: string, sourceChain: string, destChain: string): void {
    if (!this.assets.has(assetId)) {
      throw new UnknownAssetError(assetId);
    }
    const routeKey = `${sourceChain}:${destChain}`;
    if (!this.bridgeRoutes.has(routeKey)) {
      this.bridgeRoutes.set(routeKey, new Set());
    }
    this.bridgeRoutes.get(routeKey)!.add(assetId);
  }

  isBridgeable(assetId: string, sourceChain: string, destChain: string): boolean {
    return this.bridgeRoutes.get(`${sourceChain}:${destChain}`)?.has(assetId) ?? false;
  }

  getBridgeableAssets(sourceChain: string, destChain: string): CrossChainAsset[] {
    const forward = this.bridgeRoutes.get(`${sourceChain}:${destChain}`);
    const result = new Set<string>();
    if (forward) {
      for (const id of forward) result.add(id);
    }
    return Array.from(result)
      .map((id) => this.assets.get(id)!)
      .filter(Boolean);
  }

  getAll(): CrossChainAsset[] {
    return Array.from(this.assets.values());
  }

  get size(): number {
    return this.assets.size;
  }

  stats(): RegistryStats {
    const chainIdSet = new Set<string>();
    for (const asset of this.assets.values()) {
      for (const chainId of Object.keys(asset.addresses)) {
        chainIdSet.add(chainId);
      }
    }
    return {
      totalAssets: this.assets.size,
      totalChains: Array.from(chainIdSet).sort(),
      totalRoutes: this.bridgeRoutes.size,
    };
  }

  private validateAsset(asset: CrossChainAsset): void {
    if (!asset.id?.trim()) {
      throw new AssetRegistrationError('Asset id must be a non-empty string');
    }
    if (!asset.symbol?.trim()) {
      throw new AssetRegistrationError('Asset symbol must be a non-empty string');
    }
    if (!asset.name?.trim()) {
      throw new AssetRegistrationError(`Asset "${asset.id}": name must be a non-empty string`);
    }
    if (!Number.isInteger(asset.decimals) || asset.decimals < 0 || asset.decimals > 77) {
      throw new AssetRegistrationError(
        `Asset "${asset.id}": decimals must be an integer between 0 and 77, received ${asset.decimals}`,
      );
    }
    for (const [chainId, address] of Object.entries(asset.addresses)) {
      if (!chainId?.trim()) {
        throw new AssetRegistrationError(
          `Asset "${asset.id}": chain ID must be a non-empty string`,
        );
      }
      if (!address?.trim()) {
        throw new AssetRegistrationError(
          `Asset "${asset.id}": address for chain "${chainId}" must be a non-empty string`,
        );
      }
    }
  }
}
