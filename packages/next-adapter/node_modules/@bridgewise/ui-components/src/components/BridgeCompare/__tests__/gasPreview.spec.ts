import {
  getGasEstimatePreview,
  resolveGasEstimateNetwork,
} from '../gasPreview';

describe('getGasEstimatePreview', () => {
  it('returns exact gas and network fee details when route metadata is available', () => {
    const preview = getGasEstimatePreview({
      provider: 'hop',
      inputAmount: '1000000',
      outputAmount: '995000',
      feePercentage: 0.5,
      estimatedTime: 120,
      reliability: 0.98,
      minAmountOut: '990000',
      transactionData: {
        gasEstimate: '150000',
      },
      metadata: {
        feeBreakdown: {
          networkFee: '500',
        },
      },
    });

    expect(preview.hasEstimate).toBe(true);
    expect(preview.gasDisplayText).toBe('150,000 units');
    expect(preview.networkFeeDisplayText).toBe('500');
  });

  it('falls back to a pending message when providers do not return gas data', () => {
    const preview = getGasEstimatePreview({
      provider: 'stellar',
      inputAmount: '1000000',
      outputAmount: '998000',
      feePercentage: 0.2,
      estimatedTime: 30,
      reliability: 0.99,
      minAmountOut: '997500',
    });

    expect(preview.hasEstimate).toBe(false);
    expect(preview.gasDisplayText).toBe('Pending provider estimate');
    expect(preview.networkFeeDisplayText).toBeNull();
  });

  it('uses fetched network fee data when route metadata is missing', () => {
    const preview = getGasEstimatePreview(
      {
        provider: 'Hop Protocol',
        inputAmount: '1000000',
        outputAmount: '998000',
        feePercentage: 0.2,
        estimatedTime: 30,
        reliability: 0.99,
        minAmountOut: '997500',
      },
      {
        remoteEstimate: {
          network: 'hop',
          available: true,
          standardFee: '0.15',
          currency: 'ETH',
        },
      },
    );

    expect(preview.hasEstimate).toBe(true);
    expect(preview.gasDisplayText).toBe('0.15 ETH');
    expect(preview.networkFeeDisplayText).toBeNull();
  });

  it('maps supported bridge providers to gas estimation networks', () => {
    expect(resolveGasEstimateNetwork('Hop Protocol')).toBe('hop');
    expect(resolveGasEstimateNetwork('Stargate Finance')).toBe('layerzero');
    expect(resolveGasEstimateNetwork('Soroswap')).toBe('stellar');
    expect(resolveGasEstimateNetwork('Celer')).toBeNull();
  });
});