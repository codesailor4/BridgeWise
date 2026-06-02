export interface StellarAsset {
  code: string;
  issuer: string | null; // null = native XLM
}

export interface WhitelistEntry extends StellarAsset {
  addedAt: Date;
  trustedIssuer: boolean;
}

export class StellarAssetWhitelistManager {
  private readonly whitelist = new Map<string, WhitelistEntry>();
  private readonly horizonUrl: string;

  constructor(horizonUrl = 'https://horizon-testnet.stellar.org') {
    this.horizonUrl = horizonUrl;
  }

  private key(asset: StellarAsset): string {
    return asset.issuer ? `${asset.code}:${asset.issuer}` : 'XLM:native';
  }

  /** Adds an asset to the whitelist after validating issuer trust. */
  async add(asset: StellarAsset): Promise<WhitelistEntry> {
    const trustedIssuer = asset.issuer ? await this.validateIssuer(asset.issuer) : true;
    const entry: WhitelistEntry = { ...asset, addedAt: new Date(), trustedIssuer };
    this.whitelist.set(this.key(asset), entry);
    return entry;
  }

  /** Removes an asset from the whitelist. */
  remove(asset: StellarAsset): boolean {
    return this.whitelist.delete(this.key(asset));
  }

  /** Returns true if the asset is whitelisted and its issuer is trusted. */
  isAllowed(asset: StellarAsset): boolean {
    const entry = this.whitelist.get(this.key(asset));
    return entry != null && entry.trustedIssuer;
  }

  /** Returns all whitelisted assets. */
  getAll(): WhitelistEntry[] {
    return Array.from(this.whitelist.values());
  }

  /** Validates that an issuer account exists on the Stellar network. */
  async validateIssuer(issuer: string): Promise<boolean> {
    try {
      const res = await fetch(`${this.horizonUrl}/accounts/${issuer}`);
      return res.ok;
    } catch {
      return false;
    }
  }
}
