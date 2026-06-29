export interface BridgeCompareRoute {
  id?: string;
  provider: string;
  inputAmount: string;
  outputAmount: string;
  feePercentage: number;
  estimatedTime: number;
  reliability: number;
  minAmountOut: string;
  transactionData?: {
    contractAddress?: string;
    calldata?: string;
    value?: string;
    gasEstimate?: string;
  };
  metadata?: {
    description?: string;
    riskLevel?: number;
    feeBreakdown?: {
      networkFee?: string;
      bridgeFee?: string;
      slippageFee?: string;
    };
    [key: string]: unknown;
  };
}

export type GasEstimateNetwork = 'stellar' | 'layerzero' | 'hop';

export interface RemoteGasEstimate {
  network: GasEstimateNetwork;
  available: boolean;
  standardFee: string | null;
  currency: string | null;
}

export interface GasEstimatePreview {
  gasEstimate: string | null;
  networkFee: string | null;
  gasDisplayText: string;
  networkFeeDisplayText: string | null;
  hasEstimate: boolean;
}

interface GasEstimatePreviewOptions {
  remoteEstimate?: RemoteGasEstimate;
  isLoading?: boolean;
}

function formatNumberString(value: string): string {
  if (!/^-?\d+(\.\d+)?$/.test(value)) {
    return value;
  }

  return new Intl.NumberFormat('en-US').format(Number(value));
}

function formatFeeDisplay(value: string, currency: string | null): string {
  const formattedValue = formatNumberString(value);
  return currency ? `${formattedValue} ${currency}` : formattedValue;
}

export function resolveGasEstimateNetwork(provider: string): GasEstimateNetwork | null {
  const normalizedProvider = provider.toLowerCase();

  if (normalizedProvider.includes('hop')) {
    return 'hop';
  }

  if (
    normalizedProvider.includes('layerzero') ||
    normalizedProvider.includes('stargate') ||
    normalizedProvider.includes('squid')
  ) {
    return 'layerzero';
  }

  if (
    normalizedProvider.includes('stellar') ||
    normalizedProvider.includes('soroswap')
  ) {
    return 'stellar';
  }

  return null;
}

export function getGasEstimatePreview(
  route: BridgeCompareRoute,
  options: GasEstimatePreviewOptions = {},
): GasEstimatePreview {
  const { remoteEstimate, isLoading = false } = options;
  const gasEstimate = route.transactionData?.gasEstimate ?? null;
  const networkFee = route.metadata?.feeBreakdown?.networkFee ?? remoteEstimate?.standardFee ?? null;
  const gasDisplayText = gasEstimate
    ? `${formatNumberString(gasEstimate)} units`
    : remoteEstimate?.available && remoteEstimate.standardFee
      ? formatFeeDisplay(remoteEstimate.standardFee, remoteEstimate.currency)
      : isLoading
        ? 'Loading estimate...'
        : 'Pending provider estimate';
  const networkFeeDisplayText = route.metadata?.feeBreakdown?.networkFee
    ? formatNumberString(route.metadata.feeBreakdown.networkFee)
    : gasEstimate && remoteEstimate?.available && remoteEstimate.standardFee
      ? formatFeeDisplay(remoteEstimate.standardFee, remoteEstimate.currency)
      : null;

  return {
    gasEstimate,
    networkFee,
    gasDisplayText,
    networkFeeDisplayText,
    hasEstimate: Boolean(gasEstimate || networkFee),
  };
}