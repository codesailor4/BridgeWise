import { StellarDryRunService } from './stellar-dry-run.service';

describe('StellarDryRunService', () => {
  let service: StellarDryRunService;

  beforeEach(() => {
    service = new StellarDryRunService();
  });

  it('should simulate a dry-run transfer successfully', () => {
    const result = service.simulate({
      routeId: 'route-123',
      bridgeId: 'stellar-bridge',
      sourceAccount: 'GABC...1',
      destinationAccount: 'GXYZ...2',
      asset: 'USDC',
      amount: '100',
    });

    expect(result.routeId).toBe('route-123');
    expect(result.estimatedNetworkFee).toMatch(/^[0-9]+\.\d+$/);
    expect(result.estimatedExecutionMs).toBeGreaterThan(0);
    expect(result.successLikelihood).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should return warnings for large amounts and matching accounts', () => {
    const result = service.simulate({
      routeId: 'route-456',
      bridgeId: 'stellar-bridge',
      sourceAccount: 'GABC...1',
      destinationAccount: 'GABC...1',
      asset: 'XLM',
      amount: '12000',
    });

    expect(result.warnings).toContain(
      'Source and destination accounts are identical. The transfer may be invalid.',
    );
    expect(result.warnings).toContain(
      'Large transfer amount may require additional confirmation from the bridge provider.',
    );
  });

  it('should throw if the amount is invalid', () => {
    expect(() =>
      service.simulate({
        routeId: 'route-789',
        bridgeId: 'stellar-bridge',
        sourceAccount: 'GABC...1',
        destinationAccount: 'GXYZ...2',
        asset: 'USDC',
        amount: '0',
      }),
    ).toThrow('amount must be a positive numeric value');
  });
});
