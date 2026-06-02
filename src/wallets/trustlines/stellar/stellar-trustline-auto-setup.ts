/**
 * Stellar trustline auto-setup — Issue #365.
 *
 * Users routinely fail Stellar transfers when their account is missing a
 * trustline for a non-native asset (USDC, EURC, custom SACs). This module
 * detects the gap and produces a setup plan the wallet layer can execute —
 * either by signing each `changeTrust` op locally or by handing the plan to
 * the UI to walk the user through.
 *
 * The detection and planning logic is pure (no SDK, no network calls) so it
 * can be unit-tested without a live account. `executeSetupPlan` accepts an
 * injectable submitter so the caller picks the transport (Freighter, xBull,
 * Soroban CLI, etc.).
 */

/** Canonical identifier for a Stellar asset. */
export interface StellarAsset {
  /** Asset code (e.g. "USDC"), or "XLM" for the native asset. */
  code: string;
  /** Issuer account; absent for the native XLM asset. */
  issuer?: string;
}

/** Existing trustline state on an account. */
export interface ExistingTrustline {
  asset: StellarAsset;
  /** Optional human-readable balance. Not consulted by detection. */
  balance?: string;
  /** Trustline limit — `null` when unlimited (the SDK's default). */
  limit?: string | null;
}

/** A single change-trust operation the wallet needs to execute. */
export interface TrustlineSetupOperation {
  type: 'change_trust';
  asset: StellarAsset;
  /** New limit. Defaults to the SDK's max when omitted. */
  limit?: string;
}

/** The full plan: every missing trustline + ready-to-sign operations. */
export interface TrustlineSetupPlan {
  account: string;
  missing: StellarAsset[];
  operations: TrustlineSetupOperation[];
}

export type TrustlineSetupStatus = 'noop' | 'pending' | 'submitted' | 'failed';

export interface TrustlineSetupResult {
  status: TrustlineSetupStatus;
  /** True when at least one trustline op was submitted. */
  submitted: boolean;
  /** Submission result for each op (one per `plan.operations` entry). */
  operationResults: Array<{ asset: StellarAsset; ok: boolean; error?: string }>;
}

/** A function that signs and submits one trustline op to the network. */
export type TrustlineOperationSubmitter = (
  op: TrustlineSetupOperation,
  account: string,
) => Promise<void>;

/**
 * Return true when two assets reference the same on-chain trustline. The
 * native XLM asset never needs a trustline.
 */
export function isSameAsset(a: StellarAsset, b: StellarAsset): boolean {
  if (a.code !== b.code) return false;
  // Native assets have no issuer.
  if (a.code === 'XLM') return true;
  return (a.issuer ?? '') === (b.issuer ?? '');
}

/** Native XLM never needs an explicit trustline. */
export function isNativeAsset(asset: StellarAsset): boolean {
  return asset.code === 'XLM' && !asset.issuer;
}

/**
 * Diff the account's existing trustlines against a list of required assets
 * and return only the assets that are missing. Native XLM is excluded
 * because every account has it implicitly.
 */
export function detectMissingTrustlines(
  existing: ExistingTrustline[],
  required: StellarAsset[],
): StellarAsset[] {
  const missing: StellarAsset[] = [];
  for (const asset of required) {
    if (isNativeAsset(asset)) continue;
    const present = existing.some((t) => isSameAsset(t.asset, asset));
    if (!present && !missing.some((m) => isSameAsset(m, asset))) {
      missing.push(asset);
    }
  }
  return missing;
}

export interface BuildPlanOptions {
  /** Optional trust limit to apply to every change-trust op. */
  limit?: string;
}

/**
 * Build the trustline setup plan for an account given its current trustlines
 * and the assets it needs to transact. Idempotent — assets already trusted
 * are omitted from the operations list.
 */
export function buildTrustlineSetupPlan(
  account: string,
  existing: ExistingTrustline[],
  required: StellarAsset[],
  options: BuildPlanOptions = {},
): TrustlineSetupPlan {
  const missing = detectMissingTrustlines(existing, required);
  const operations: TrustlineSetupOperation[] = missing.map((asset) => ({
    type: 'change_trust',
    asset,
    ...(options.limit !== undefined ? { limit: options.limit } : {}),
  }));
  return { account, missing, operations };
}

/**
 * Execute every op in the plan via the injected submitter. Operations are
 * submitted in order so a later failure does not leave the account in a state
 * that depends on a later one having succeeded.
 */
export async function executeSetupPlan(
  plan: TrustlineSetupPlan,
  submit: TrustlineOperationSubmitter,
): Promise<TrustlineSetupResult> {
  if (plan.operations.length === 0) {
    return { status: 'noop', submitted: false, operationResults: [] };
  }

  const operationResults: TrustlineSetupResult['operationResults'] = [];
  let anyFailure = false;
  let anySubmitted = false;

  for (const op of plan.operations) {
    try {
      await submit(op, plan.account);
      operationResults.push({ asset: op.asset, ok: true });
      anySubmitted = true;
    } catch (err) {
      anyFailure = true;
      operationResults.push({
        asset: op.asset,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    status: anyFailure ? 'failed' : 'submitted',
    submitted: anySubmitted,
    operationResults,
  };
}
