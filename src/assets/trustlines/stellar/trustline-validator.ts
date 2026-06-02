import { Injectable, Logger } from '@nestjs/common';
import { Keypair } from 'stellar-sdk';

/**
 * Represents a Stellar asset
 */
export interface StellarAsset {
  code: string;
  issuer: string;
}

/**
 * Represents a trustline on a Stellar account
 */
export interface Trustline {
  asset: StellarAsset;
  balance: string;
  limit: string;
  isNative: boolean;
}

/**
 * Corrective action to establish or modify a trustline
 */
export interface TrustlineAction {
  type: 'establish' | 'modify-limit' | 'delete';
  asset: StellarAsset;
  limit?: string;
  description: string;
  requiredFee: string; // XLM fee for the operation
}

/**
 * Result of trustline validation
 */
export interface TrustlineValidationResult {
  accountId: string;
  isValid: boolean;
  requiredAssets: StellarAsset[];
  existingTrustlines: Trustline[];
  missingTrustlines: StellarAsset[];
  insufficientLimits: Array<{
    asset: StellarAsset;
    currentLimit: string;
    requiredLimit: string;
  }>;
  errors: TrustlineError[];
  suggestedActions: TrustlineAction[];
}

/**
 * Trustline validation error
 */
export interface TrustlineError {
  asset: StellarAsset;
  code: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Configuration for trustline validation
 */
export interface TrustlineValidatorConfig {
  requiredAssets?: StellarAsset[];
  minimumLimits?: Map<string, string>; // Map of asset code to minimum limit
  allowDeltas?: boolean; // Allow small variations in limits
  deltaThreshold?: string; // Threshold for delta checks (default: "0.0001")
}

const DEFAULT_CONFIG: TrustlineValidatorConfig = {
  requiredAssets: [],
  minimumLimits: new Map(),
  allowDeltas: true,
  deltaThreshold: '0.0001',
};

/**
 * Validator for Stellar trustlines
 * Detects missing trustlines and suggests corrective actions
 */
@Injectable()
export class TrustlineValidator {
  private readonly logger = new Logger(TrustlineValidator.name);
  private config: TrustlineValidatorConfig;

  constructor(config: Partial<TrustlineValidatorConfig> = {}) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
      minimumLimits: new Map([
        ...(DEFAULT_CONFIG.minimumLimits || []),
        ...(config.minimumLimits || []),
      ]),
    };
  }

  /**
   * Validate if an account has required trustlines for specified assets
   * @param accountId - Stellar account public key
   * @param existingTrustlines - Current trustlines on the account
   * @param requiredAssets - Assets that must have trustlines (defaults to config)
   * @returns Validation result with missing trustlines and suggested actions
   */
  validate(
    accountId: string,
    existingTrustlines: Trustline[],
    requiredAssets?: StellarAsset[],
  ): TrustlineValidationResult {
    const assets = requiredAssets || this.config.requiredAssets || [];
    const errors: TrustlineError[] = [];
    const missingTrustlines: StellarAsset[] = [];
    const insufficientLimits: TrustlineValidationResult['insufficientLimits'] = [];

    // Validate account ID format
    if (!this.isValidAccountId(accountId)) {
      errors.push({
        asset: { code: 'ACCOUNT', issuer: '' },
        code: 'INVALID_ACCOUNT_ID',
        message: `Invalid Stellar account ID: ${accountId}`,
        severity: 'error',
      });
      return {
        accountId,
        isValid: false,
        requiredAssets: assets,
        existingTrustlines,
        missingTrustlines: assets,
        insufficientLimits: [],
        errors,
        suggestedActions: this.suggestActionsForMissing(assets),
      };
    }

    // Check for native asset (XLM)
    const requiresNative = assets.some(
      (asset) => asset.code === 'XLM' || asset.code === 'native',
    );

    // Create a map of existing trustlines for quick lookup
    const trustlineMap = new Map<string, Trustline>();
    for (const trustline of existingTrustlines) {
      const key = this.getTrustlineKey(trustline.asset);
      trustlineMap.set(key, trustline);
    }

    // Check each required asset
    for (const requiredAsset of assets) {
      if (requiredAsset.code === 'XLM' || requiredAsset.code === 'native') {
        // XLM is always available
        continue;
      }

      const key = this.getTrustlineKey(requiredAsset);
      const existingTrustline = trustlineMap.get(key);

      if (!existingTrustline) {
        missingTrustlines.push(requiredAsset);
        errors.push({
          asset: requiredAsset,
          code: 'MISSING_TRUSTLINE',
          message: `No trustline found for asset ${requiredAsset.code} issued by ${requiredAsset.issuer}`,
          severity: 'error',
        });
      } else {
        // Check if limit is sufficient
        const minimumLimit = this.config.minimumLimits?.get(requiredAsset.code);
        if (minimumLimit && !this.isLimitSufficient(existingTrustline.limit, minimumLimit)) {
          insufficientLimits.push({
            asset: requiredAsset,
            currentLimit: existingTrustline.limit,
            requiredLimit: minimumLimit,
          });
          errors.push({
            asset: requiredAsset,
            code: 'INSUFFICIENT_LIMIT',
            message: `Trustline limit for ${requiredAsset.code} is ${existingTrustline.limit}, minimum required: ${minimumLimit}`,
            severity: 'warning',
          });
        }
      }
    }

    const isValid = errors.filter((e) => e.severity === 'error').length === 0;
    const suggestedActions = this.suggestActions(
      accountId,
      missingTrustlines,
      insufficientLimits,
    );

    return {
      accountId,
      isValid,
      requiredAssets: assets,
      existingTrustlines,
      missingTrustlines,
      insufficientLimits,
      errors,
      suggestedActions,
    };
  }

  /**
   * Suggest corrective actions for missing or insufficient trustlines
   */
  private suggestActions(
    accountId: string,
    missingTrustlines: StellarAsset[],
    insufficientLimits: TrustlineValidationResult['insufficientLimits'],
  ): TrustlineAction[] {
    const actions: TrustlineAction[] = [];

    // Suggest establishing missing trustlines
    for (const asset of missingTrustlines) {
      const limit = this.config.minimumLimits?.get(asset.code) || '922337203685.4775807'; // Max int64 in Stellar
      actions.push({
        type: 'establish',
        asset,
        limit,
        description: `Establish trustline for ${asset.code} issued by ${asset.issuer}. This allows receiving and holding ${asset.code} tokens.`,
        requiredFee: '0.0000500', // 50 stroops, standard Stellar fee
      });
    }

    // Suggest modifying insufficient limits
    for (const insufficient of insufficientLimits) {
      const newLimit = this.config.minimumLimits?.get(insufficient.asset.code) || insufficient.requiredLimit;
      actions.push({
        type: 'modify-limit',
        asset: insufficient.asset,
        limit: newLimit,
        description: `Increase trustline limit for ${insufficient.asset.code} from ${insufficient.currentLimit} to ${newLimit} to enable transfers of required amounts.`,
        requiredFee: '0.0000500',
      });
    }

    return actions;
  }

  /**
   * Generate suggested actions for missing trustlines
   */
  private suggestActionsForMissing(assets: StellarAsset[]): TrustlineAction[] {
    return assets
      .filter((asset) => asset.code !== 'XLM' && asset.code !== 'native')
      .map((asset) => {
        const limit = this.config.minimumLimits?.get(asset.code) || '922337203685.4775807';
        return {
          type: 'establish',
          asset,
          limit,
          description: `Establish trustline for ${asset.code} issued by ${asset.issuer}. This allows receiving and holding ${asset.code} tokens.`,
          requiredFee: '0.0000500',
        };
      });
  }

  /**
   * Check if a Stellar account ID is valid
   */
  private isValidAccountId(accountId: string): boolean {
    try {
      Keypair.fromPublicKey(accountId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a unique key for a trustline based on asset code and issuer
   */
  private getTrustlineKey(asset: StellarAsset): string {
    return `${asset.code}:${asset.issuer}`;
  }

  /**
   * Check if a trustline limit is sufficient for the required amount
   */
  private isLimitSufficient(limit: string, requiredLimit: string): boolean {
    try {
      const limitNum = parseFloat(limit);
      const requiredNum = parseFloat(requiredLimit);
      return limitNum >= requiredNum;
    } catch {
      return false;
    }
  }

  /**
   * Add a required asset to the validator
   */
  addRequiredAsset(asset: StellarAsset, minimumLimit?: string): void {
    if (!this.config.requiredAssets) {
      this.config.requiredAssets = [];
    }

    const exists = this.config.requiredAssets.some(
      (a) => a.code === asset.code && a.issuer === asset.issuer,
    );

    if (!exists) {
      this.config.requiredAssets.push(asset);
      if (minimumLimit) {
        this.config.minimumLimits?.set(asset.code, minimumLimit);
      }
    }
  }

  /**
   * Remove a required asset from the validator
   */
  removeRequiredAsset(assetCode: string, issuer: string): void {
    if (!this.config.requiredAssets) return;

    this.config.requiredAssets = this.config.requiredAssets.filter(
      (a) => !(a.code === assetCode && a.issuer === issuer),
    );
  }

  /**
   * Get the current required assets configuration
   */
  getRequiredAssets(): StellarAsset[] {
    return this.config.requiredAssets || [];
  }

  /**
   * Get minimum limits configuration
   */
  getMinimumLimits(): Map<string, string> {
    return this.config.minimumLimits || new Map();
  }

  /**
   * Update minimum limit for an asset
   */
  setMinimumLimit(assetCode: string, limit: string): void {
    if (!this.config.minimumLimits) {
      this.config.minimumLimits = new Map();
    }
    this.config.minimumLimits.set(assetCode, limit);
  }
}
