export interface AssetBalance {
  asset: string;
  balance: string;
  accountId: string;
}

export interface BalanceSyncResult {
  accountId: string;
  synced: AssetBalance[];
  syncedAt: Date;
}

export async function fetchStellarBalances(
  accountId: string,
  rpcUrl: string
): Promise<AssetBalance[]> {
  const response = await fetch(`${rpcUrl}/accounts/${accountId}`);
  if (!response.ok) throw new Error(`Failed to fetch balances for ${accountId}`);
  const data = await response.json() as { balances: { asset_type: string; asset_code?: string; balance: string }[] };
  return data.balances.map((b) => ({
    asset: b.asset_code ?? b.asset_type,
    balance: b.balance,
    accountId,
  }));
}

export async function syncAssetBalances(
  accountIds: string[],
  rpcUrl: string
): Promise<BalanceSyncResult[]> {
  const results: BalanceSyncResult[] = [];
  for (const accountId of accountIds) {
    const synced = await fetchStellarBalances(accountId, rpcUrl);
    results.push({ accountId, synced, syncedAt: new Date() });
  }
  return results;
}