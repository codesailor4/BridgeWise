/**
 * File: src/compatibility/stellar/compatibilityScanner.ts
 *
 * Scans compatibility between Soroban contracts and bridge providers.
 * Validates bridge support and detects unsupported contract features.
 */

export interface SorobanContractFeature {
    name: string;
    version?: string;
    required: boolean;
  }
  
  export interface BridgeProvider {
    id: string;
    name: string;
    supportedFeatures: string[];
    supportedNetworks: string[];
  }
  
  export interface CompatibilityReport {
    compatible: boolean;
    bridgeProviderId: string;
    supportedFeatures: string[];
    unsupportedFeatures: string[];
    warnings: string[];
    errors: string[];
    scannedAt: Date;
  }
  
  export interface ScanOptions {
    strictMode?: boolean; // Fail on any warning
    ignoreOptional?: boolean; // Skip non-required features
  }
  
  const KNOWN_UNSUPPORTED_FEATURES: Record<string, string[]> = {
    "bridge-provider-alpha": ["auth_invoke", "custom_types_v2"],
    "bridge-provider-beta": ["upload_contract_wasm"],
  };
  
  /**
   * Validates whether a bridge provider supports a given set of Soroban contract features.
   */
  export function validateBridgeSupport(
    provider: BridgeProvider,
    contractFeatures: SorobanContractFeature[],
    options: ScanOptions = {}
  ): CompatibilityReport {
    const { strictMode = false, ignoreOptional = false } = options;
  
    const supportedFeatures: string[] = [];
    const unsupportedFeatures: string[] = [];
    const warnings: string[] = [];
    const errors: string[] = [];
  
    const featuresToCheck = ignoreOptional
      ? contractFeatures.filter((f) => f.required)
      : contractFeatures;
  
    for (const feature of featuresToCheck) {
      const isSupported = provider.supportedFeatures.includes(feature.name);
  
      if (isSupported) {
        supportedFeatures.push(feature.name);
      } else {
        if (feature.required) {
          errors.push(
            `Bridge provider "${provider.name}" does not support required feature: "${feature.name}".`
          );
          unsupportedFeatures.push(feature.name);
        } else {
          warnings.push(
            `Bridge provider "${provider.name}" does not support optional feature: "${feature.name}".`
          );
          unsupportedFeatures.push(feature.name);
        }
      }
    }
  
    if (strictMode && warnings.length > 0) {
      errors.push(...warnings.map((w) => `[Strict] ${w}`));
    }
  
    const compatible = errors.length === 0;
  
    return {
      compatible,
      bridgeProviderId: provider.id,
      supportedFeatures,
      unsupportedFeatures,
      warnings: strictMode ? [] : warnings,
      errors,
      scannedAt: new Date(),
    };
  }
  
  /**
   * Detects unsupported Soroban contract features for a specific bridge provider.
   */
  export function detectUnsupportedFeatures(
    providerId: string,
    contractFeatures: SorobanContractFeature[]
  ): string[] {
    const knownUnsupported = KNOWN_UNSUPPORTED_FEATURES[providerId] ?? [];
  
    return contractFeatures
      .filter((f) => knownUnsupported.includes(f.name))
      .map((f) => f.name);
  }
  
  /**
   * Main compatibility scanner — runs full scan for a contract against a bridge provider.
   */
  export class CompatibilityScanner {
    private provider: BridgeProvider;
  
    constructor(provider: BridgeProvider) {
      this.provider = provider;
    }
  
    scan(
      contractFeatures: SorobanContractFeature[],
      options?: ScanOptions
    ): CompatibilityReport {
      const knownUnsupported = detectUnsupportedFeatures(
        this.provider.id,
        contractFeatures
      );
  
      if (knownUnsupported.length > 0) {
        console.warn(
          `[CompatibilityScanner] Known unsupported features detected for provider "${this.provider.id}":`,
          knownUnsupported
        );
      }
  
      return validateBridgeSupport(this.provider, contractFeatures, options);
    }
  
    getProvider(): BridgeProvider {
      return this.provider;
    }
  }
  
  export default CompatibilityScanner;