export {
  detectMissingTrustlines,
  buildTrustlineSetupPlan,
  executeSetupPlan,
  isSameAsset,
  isNativeAsset,
} from './stellar-trustline-auto-setup';
export type {
  StellarAsset,
  ExistingTrustline,
  TrustlineSetupOperation,
  TrustlineSetupPlan,
  TrustlineSetupStatus,
  TrustlineSetupResult,
  TrustlineOperationSubmitter,
  BuildPlanOptions,
} from './stellar-trustline-auto-setup';
