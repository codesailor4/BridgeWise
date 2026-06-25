import {
  StellarTemplate,
  StellarTemplateConfig,
  TemplateResult,
} from '../types';
import { NETWORK_PRESETS, DEFAULT_NETWORK } from '../config/default-config';

export class BaseStellarTemplate implements StellarTemplate {
  readonly id = 'stellar-base';
  readonly name = 'Base Stellar Integration';
  readonly description = 'Foundation template for any Stellar integration';
  readonly type = 'custom' as const;
  readonly version = '1.0.0';
  readonly variables = [];

  generate(config: StellarTemplateConfig): Record<string, unknown> {
    const network = NETWORK_PRESETS[config.network || DEFAULT_NETWORK];

    return {
      networkConfig: {
        horizonUrl: network.horizonUrl,
        rpcUrl: network.rpcUrl,
        passphrase: network.passphrase,
        network: config.network || DEFAULT_NETWORK,
      },
      sourceAccount: config.sourceAccount,
      fee: config.fee || 100,
      timeout: config.timeout || 30,
      memo: config.memo,
      ...(config.customConfig || {}),
    };
  }

  validate(config: StellarTemplateConfig): string[] {
    const errors: string[] = [];

    if (!config.sourceAccount) {
      errors.push('Source account is required');
    } else if (!config.sourceAccount.startsWith('G') && !config.sourceAccount.startsWith('S')) {
      errors.push('Source account must be a valid Stellar key (G... or S...)');
    }

    if (config.network && !(config.network in NETWORK_PRESETS)) {
      errors.push(`Unknown network: ${config.network}`);
    }

    return errors;
  }

  getDefaults(): Partial<StellarTemplateConfig> {
    return {
      network: DEFAULT_NETWORK,
      fee: 100,
      timeout: 30,
    };
  }
}
