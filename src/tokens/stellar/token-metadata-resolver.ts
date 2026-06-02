export interface TokenMetadata {
  assetCode: string;
  issuer: string;
  decimals: number;
  symbol: string;
}

const cache = new Map<string, TokenMetadata>();

export async function resolveTokenMetadata(
  assetCode: string,
  issuer: string,
  horizonUrl: string
): Promise<TokenMetadata> {
  const key = `${assetCode}:${issuer}`;
  if (cache.has(key)) return cache.get(key)!;

  const res = await fetch(`${horizonUrl}/assets?asset_code=${assetCode}&asset_issuer=${issuer}`);
  if (!res.ok) throw new Error(`Failed to fetch metadata for ${key}`);
  const data = await res.json() as { _embedded: { records: { asset_code: string; asset_issuer: string }[] } };
  const record = data._embedded.records[0];

  const metadata: TokenMetadata = {
    assetCode: record?.asset_code ?? assetCode,
    issuer: record?.asset_issuer ?? issuer,
    decimals: 7,
    symbol: assetCode,
  };
  cache.set(key, metadata);
  return metadata;
}

export function clearMetadataCache(): void {
  cache.clear();
}