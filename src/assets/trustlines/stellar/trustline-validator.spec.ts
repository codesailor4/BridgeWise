import { TrustlineValidator, StellarAsset, Trustline } from './trustline-validator';

describe('TrustlineValidator', () => {
  let validator: TrustlineValidator;
  const validAccountId = 'GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQA5XYEPTS5ACW5NJ2JAYhvilq';
  const issuer = 'GCNY5OXYSY4FZLG2DNC7VQ6JTLW5NZ5YLMAO5NYTIGRA降LOW7IXKTMQ';

  beforeEach(() => {
    validator = new TrustlineValidator();
  });

  describe('Trustline Detection', () => {
    it('should detect missing trustlines', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
        { code: 'EUR', issuer },
      ];
      const existingTrustlines: Trustline[] = [
        {
          asset: { code: 'USDC', issuer },
          balance: '1000',
          limit: '100000',
          isNative: false,
        },
      ];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      expect(result.isValid).toBe(false);
      expect(result.missingTrustlines).toEqual([{ code: 'EUR', issuer }]);
      expect(result.errors.some((e) => e.code === 'MISSING_TRUSTLINE')).toBe(true);
    });

    it('should recognize valid trustlines', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];
      const existingTrustlines: Trustline[] = [
        {
          asset: { code: 'USDC', issuer },
          balance: '5000',
          limit: '100000',
          isNative: false,
        },
      ];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      expect(result.missingTrustlines).toHaveLength(0);
    });

    it('should handle native XLM asset', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'XLM', issuer: '' },
        { code: 'USDC', issuer },
      ];
      const existingTrustlines: Trustline[] = [];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      // XLM should not be in missing trustlines since it's always available
      expect(result.missingTrustlines).toEqual([{ code: 'USDC', issuer }]);
    });
  });

  describe('Insufficient Limit Detection', () => {
    it('should detect insufficient trustline limits', () => {
      const validator = new TrustlineValidator({
        minimumLimits: new Map([['USDC', '50000']]),
      });

      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];
      const existingTrustlines: Trustline[] = [
        {
          asset: { code: 'USDC', issuer },
          balance: '1000',
          limit: '10000', // Less than minimum of 50000
          isNative: false,
        },
      ];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      expect(result.insufficientLimits).toHaveLength(1);
      expect(result.insufficientLimits[0].currentLimit).toBe('10000');
      expect(result.insufficientLimits[0].requiredLimit).toBe('50000');
      expect(result.errors.some((e) => e.code === 'INSUFFICIENT_LIMIT')).toBe(true);
    });

    it('should pass with sufficient limits', () => {
      const validator = new TrustlineValidator({
        minimumLimits: new Map([['USDC', '50000']]),
      });

      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];
      const existingTrustlines: Trustline[] = [
        {
          asset: { code: 'USDC', issuer },
          balance: '1000',
          limit: '100000', // Greater than minimum
          isNative: false,
        },
      ];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      expect(result.insufficientLimits).toHaveLength(0);
    });
  });

  describe('Suggested Actions', () => {
    it('should suggest establishing missing trustlines', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
        { code: 'EUR', issuer },
      ];
      const existingTrustlines: Trustline[] = [];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      expect(result.suggestedActions).toHaveLength(2);
      expect(result.suggestedActions.every((a) => a.type === 'establish')).toBe(true);
      expect(result.suggestedActions.every((a) => a.requiredFee === '0.0000500')).toBe(true);
    });

    it('should suggest modifying insufficient limits', () => {
      const validator = new TrustlineValidator({
        minimumLimits: new Map([['USDC', '100000']]),
      });

      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];
      const existingTrustlines: Trustline[] = [
        {
          asset: { code: 'USDC', issuer },
          balance: '1000',
          limit: '10000',
          isNative: false,
        },
      ];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      const modifyActions = result.suggestedActions.filter((a) => a.type === 'modify-limit');
      expect(modifyActions).toHaveLength(1);
      expect(modifyActions[0].limit).toBe('100000');
    });

    it('should include action descriptions', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];
      const existingTrustlines: Trustline[] = [];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      expect(result.suggestedActions[0].description).toContain('Establish trustline');
      expect(result.suggestedActions[0].description).toContain('USDC');
    });
  });

  describe('Account Validation', () => {
    it('should reject invalid account IDs', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];
      const invalidAccountId = 'invalid-account-id';

      const result = validator.validate(invalidAccountId, [], requiredAssets);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.code === 'INVALID_ACCOUNT_ID')).toBe(true);
    });
  });

  describe('Configuration Management', () => {
    it('should add required assets', () => {
      validator.addRequiredAsset({ code: 'USDC', issuer }, '50000');

      const required = validator.getRequiredAssets();
      expect(required).toHaveLength(1);
      expect(required[0].code).toBe('USDC');
    });

    it('should not add duplicate assets', () => {
      const asset = { code: 'USDC', issuer };
      validator.addRequiredAsset(asset, '50000');
      validator.addRequiredAsset(asset, '60000');

      const required = validator.getRequiredAssets();
      expect(required).toHaveLength(1);
    });

    it('should remove required assets', () => {
      validator.addRequiredAsset({ code: 'USDC', issuer }, '50000');
      validator.removeRequiredAsset('USDC', issuer);

      const required = validator.getRequiredAssets();
      expect(required).toHaveLength(0);
    });

    it('should manage minimum limits', () => {
      validator.setMinimumLimit('USDC', '100000');

      const limits = validator.getMinimumLimits();
      expect(limits.get('USDC')).toBe('100000');
    });
  });

  describe('Multiple Assets', () => {
    it('should validate multiple assets simultaneously', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
        { code: 'EUR', issuer },
        { code: 'GBP', issuer },
      ];
      const existingTrustlines: Trustline[] = [
        {
          asset: { code: 'USDC', issuer },
          balance: '1000',
          limit: '100000',
          isNative: false,
        },
        {
          asset: { code: 'EUR', issuer },
          balance: '500',
          limit: '50000',
          isNative: false,
        },
      ];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      expect(result.missingTrustlines).toHaveLength(1);
      expect(result.missingTrustlines[0].code).toBe('GBP');
    });
  });

  describe('Error Severity Levels', () => {
    it('should report missing trustlines as errors', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];

      const result = validator.validate(validAccountId, [], requiredAssets);

      const missingErrors = result.errors.filter((e) => e.code === 'MISSING_TRUSTLINE');
      expect(missingErrors.every((e) => e.severity === 'error')).toBe(true);
    });

    it('should report insufficient limits as warnings', () => {
      const validator = new TrustlineValidator({
        minimumLimits: new Map([['USDC', '50000']]),
      });

      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];
      const existingTrustlines: Trustline[] = [
        {
          asset: { code: 'USDC', issuer },
          balance: '1000',
          limit: '10000',
          isNative: false,
        },
      ];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      const insufficientErrors = result.errors.filter((e) => e.code === 'INSUFFICIENT_LIMIT');
      expect(insufficientErrors.every((e) => e.severity === 'warning')).toBe(true);
    });
  });

  describe('Validation Result Structure', () => {
    it('should include all required fields in validation result', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];
      const existingTrustlines: Trustline[] = [];

      const result = validator.validate(validAccountId, existingTrustlines, requiredAssets);

      expect(result).toHaveProperty('accountId');
      expect(result).toHaveProperty('isValid');
      expect(result).toHaveProperty('requiredAssets');
      expect(result).toHaveProperty('existingTrustlines');
      expect(result).toHaveProperty('missingTrustlines');
      expect(result).toHaveProperty('insufficientLimits');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('suggestedActions');
    });

    it('should populate action details correctly', () => {
      const requiredAssets: StellarAsset[] = [
        { code: 'USDC', issuer },
      ];

      const result = validator.validate(validAccountId, [], requiredAssets);

      const action = result.suggestedActions[0];
      expect(action).toHaveProperty('type');
      expect(action).toHaveProperty('asset');
      expect(action).toHaveProperty('limit');
      expect(action).toHaveProperty('description');
      expect(action).toHaveProperty('requiredFee');
    });
  });
});
