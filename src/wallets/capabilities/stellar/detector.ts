import type { WalletAdapter, WalletAccount } from '../../../../packages/wallet/src';

export interface SorobanWalletCapabilities {
  walletId: string;
  name?: string;
  type?: string;
  supports: {
    signTransaction: boolean;
    signData: boolean;
    getNetwork: boolean;
    isConnected: boolean;
    sorobanRpc: boolean;
  };
  metadata?: Record<string, unknown>;
}

/**
 * Detect capabilities of a connected Soroban (Stellar) wallet adapter.
 * The detector is conservative: it checks for presence of adapter methods
 * and non-invasive read-only fields where available.
 */
export async function detectSorobanWalletCapabilities(
  adapter: WalletAdapter
): Promise<SorobanWalletCapabilities> {
  const walletId = (adapter as any).id || adapter.id || 'unknown';
  const name = (adapter as any).name || adapter.name;
  const type = (adapter as any).type || adapter.type;

  const supportsSignTransaction = typeof adapter.sendTransaction === 'function';
  const supportsSignData = typeof adapter.sign === 'function';
  const supportsGetNetwork = typeof (adapter as any).getFreighterNetwork === 'function';

  // Conservative isConnected: try to call getAccount() but do not throw.
  let isConnected = false;
  try {
    const account: WalletAccount | null = await adapter.getAccount();
    isConnected = !!account;
  } catch {
    isConnected = false;
  }

  // Detect Soroban RPC support heuristically: Freighter/other adapters sometimes
  // expose an RPC URL option or provider option. Check for commonly used fields.
  const hasRpcUrl = !!((adapter as any).freighterOptions && (adapter as any).freighterOptions.rpcUrl);
  const provider = (adapter as any).provider || null;
  const providerHasRpc = !!(provider && typeof provider.request === 'function');

  const sorobanRpc = hasRpcUrl || providerHasRpc;

  const capabilities: SorobanWalletCapabilities = {
    walletId,
    name,
    type,
    supports: {
      signTransaction: supportsSignTransaction,
      signData: supportsSignData,
      getNetwork: supportsGetNetwork,
      isConnected,
      sorobanRpc,
    },
    metadata: {
      inferredFrom: {
        hasFreighterRpcOption: hasRpcUrl,
        providerExposesRequest: providerHasRpc,
      },
    },
  };

  return capabilities;
}

export default detectSorobanWalletCapabilities;
