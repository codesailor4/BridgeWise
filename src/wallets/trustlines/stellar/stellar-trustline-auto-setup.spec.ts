import {
  detectMissingTrustlines,
  buildTrustlineSetupPlan,
  executeSetupPlan,
  isSameAsset,
  isNativeAsset,
  type StellarAsset,
  type ExistingTrustline,
  type TrustlineSetupOperation,
} from './stellar-trustline-auto-setup';

const USDC: StellarAsset = { code: 'USDC', issuer: 'GA_USDC_ISSUER' };
const EURC: StellarAsset = { code: 'EURC', issuer: 'GA_EURC_ISSUER' };
const XLM: StellarAsset = { code: 'XLM' };

function trust(asset: StellarAsset, limit: string | null = null): ExistingTrustline {
  return { asset, limit };
}

const ACCOUNT = 'GA_ACCOUNT';

describe('isSameAsset / isNativeAsset', () => {
  it('compares non-native assets by code and issuer', () => {
    expect(isSameAsset(USDC, { code: 'USDC', issuer: 'GA_USDC_ISSUER' })).toBe(true);
    expect(isSameAsset(USDC, { code: 'USDC', issuer: 'GA_OTHER' })).toBe(false);
    expect(isSameAsset(USDC, EURC)).toBe(false);
  });

  it('treats XLM as native regardless of issuer (and ignores any issuer field)', () => {
    expect(isSameAsset(XLM, { code: 'XLM' })).toBe(true);
    expect(isNativeAsset(XLM)).toBe(true);
    expect(isNativeAsset(USDC)).toBe(false);
  });
});

describe('detectMissingTrustlines', () => {
  it('returns the empty list when every required asset is already trusted', () => {
    expect(detectMissingTrustlines([trust(USDC), trust(EURC)], [USDC, EURC])).toEqual([]);
  });

  it('lists every required asset the account does not yet trust', () => {
    expect(detectMissingTrustlines([trust(USDC)], [USDC, EURC])).toEqual([EURC]);
  });

  it('excludes the native XLM asset — every account has it implicitly', () => {
    expect(detectMissingTrustlines([], [XLM, USDC])).toEqual([USDC]);
  });

  it('de-duplicates required assets so a repeat does not appear twice', () => {
    expect(detectMissingTrustlines([], [USDC, USDC])).toEqual([USDC]);
  });

  it('treats USDC issued by different issuers as distinct assets', () => {
    const fake = { code: 'USDC', issuer: 'GA_FAKE_USDC_ISSUER' };
    expect(detectMissingTrustlines([trust(USDC)], [fake])).toEqual([fake]);
  });
});

describe('buildTrustlineSetupPlan', () => {
  it('builds a plan with one change_trust op per missing asset', () => {
    const plan = buildTrustlineSetupPlan(ACCOUNT, [], [USDC, EURC]);
    expect(plan.account).toBe(ACCOUNT);
    expect(plan.missing).toEqual([USDC, EURC]);
    expect(plan.operations).toEqual<TrustlineSetupOperation[]>([
      { type: 'change_trust', asset: USDC },
      { type: 'change_trust', asset: EURC },
    ]);
  });

  it('is a no-op (empty plan) when everything is already trusted', () => {
    const plan = buildTrustlineSetupPlan(ACCOUNT, [trust(USDC)], [USDC]);
    expect(plan.missing).toEqual([]);
    expect(plan.operations).toEqual([]);
  });

  it('applies a caller-supplied trust limit to every op', () => {
    const plan = buildTrustlineSetupPlan(ACCOUNT, [], [USDC], { limit: '100000' });
    expect(plan.operations[0]).toEqual({ type: 'change_trust', asset: USDC, limit: '100000' });
  });
});

describe('executeSetupPlan', () => {
  it('returns noop without invoking the submitter for an empty plan', async () => {
    const submit = jest.fn();
    const plan = buildTrustlineSetupPlan(ACCOUNT, [trust(USDC)], [USDC]);
    const result = await executeSetupPlan(plan, submit);
    expect(submit).not.toHaveBeenCalled();
    expect(result.status).toBe('noop');
    expect(result.submitted).toBe(false);
  });

  it('submits one op per missing trustline and reports success', async () => {
    const submit = jest.fn().mockResolvedValue(undefined);
    const plan = buildTrustlineSetupPlan(ACCOUNT, [], [USDC, EURC]);
    const result = await executeSetupPlan(plan, submit);
    expect(submit).toHaveBeenCalledTimes(2);
    expect(result.status).toBe('submitted');
    expect(result.submitted).toBe(true);
    expect(result.operationResults.map((r) => r.ok)).toEqual([true, true]);
  });

  it('continues past a failing op and reports the error', async () => {
    const submit = jest.fn<Promise<void>, [TrustlineSetupOperation, string]>().mockImplementation(async (op) => {
      if (op.asset.code === 'USDC') throw new Error('reject');
    });
    const plan = buildTrustlineSetupPlan(ACCOUNT, [], [USDC, EURC]);
    const result = await executeSetupPlan(plan, submit);
    expect(result.status).toBe('failed');
    expect(result.submitted).toBe(true); // EURC still submitted
    expect(result.operationResults[0]).toMatchObject({ ok: false, error: 'reject' });
    expect(result.operationResults[1].ok).toBe(true);
  });
});
