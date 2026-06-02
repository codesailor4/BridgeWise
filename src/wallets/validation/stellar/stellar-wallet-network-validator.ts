export type StellarNetwork = "mainnet" | "testnet";

export type StellarWalletNetworkValidation = {
  expected: StellarNetwork;
  detected: StellarNetwork;
  valid: boolean;
  warning?: string;
};

export function validateStellarWalletNetwork(
  expected: StellarNetwork,
  detected: StellarNetwork
): StellarWalletNetworkValidation {
  const valid = expected === detected;
  return {
    expected,
    detected,
    valid,
    warning: valid ? undefined : `Wallet is on ${detected}, expected ${expected}.`,
  };
}
