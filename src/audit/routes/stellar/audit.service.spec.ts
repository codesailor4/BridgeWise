import { StellarRouteAuditAPI } from './audit.service';
import { AuditAction, AuditStatus } from './audit.types';

describe('StellarRouteAuditAPI', () => {
  let auditAPI: StellarRouteAuditAPI;

  beforeEach(() => {
    auditAPI = new StellarRouteAuditAPI({
      maxSearchResults: 5,
    });
  });

  describe('logRecommendationAction', () => {
    it('should successfully log a route recommendation action', () => {
      const log = auditAPI.logRecommendationAction({
        recommendationId: 'rec-123',
        action: AuditAction.RECOMMENDATION_REQUESTED,
        actor: 'user-1',
        fromAsset: 'USDC',
        toAsset: 'XLM',
        amount: '100',
        sender: 'GBAD...',
        status: AuditStatus.PENDING,
      });

      expect(log.auditId).toBeDefined();
      expect(log.timestamp).toBeLessThanOrEqual(Date.now());
      expect(log.recommendationId).toBe('rec-123');
      expect(log.action).toBe(AuditAction.RECOMMENDATION_REQUESTED);
      expect(log.fromAsset).toBe('USDC');
      expect(log.toAsset).toBe('XLM');
      expect(log.amount).toBe('100');
      expect(log.sender).toBe('GBAD...');
      expect(log.status).toBe(AuditStatus.PENDING);
    });
  });

  describe('search', () => {
    beforeEach(() => {
      // Seed some logs
      auditAPI.logRecommendationAction({
        recommendationId: 'rec-1',
        action: AuditAction.RECOMMENDATION_REQUESTED,
        actor: 'user-1',
        fromAsset: 'USDC',
        toAsset: 'XLM',
        amount: '100',
        sender: 'GBAD...',
        status: AuditStatus.PENDING,
      });

      auditAPI.logRecommendationAction({
        recommendationId: 'rec-1',
        action: AuditAction.ROUTES_RANKED,
        actor: 'system',
        fromAsset: 'USDC',
        toAsset: 'XLM',
        amount: '100',
        sender: 'GBAD...',
        selectedRouteId: 'route-opt-1',
        selectedProvider: 'provider-a',
        routesConsidered: 3,
        status: AuditStatus.COMPLETED,
      });

      auditAPI.logRecommendationAction({
        recommendationId: 'rec-2',
        action: AuditAction.RECOMMENDATION_FAILED,
        actor: 'system',
        fromAsset: 'EURC',
        toAsset: 'XLM',
        amount: '500',
        status: AuditStatus.FAILED,
        errorMessage: 'No routes found',
      });
    });

    it('should search by recommendationIds', async () => {
      const result = await auditAPI.search({ recommendationIds: ['rec-1'] });
      expect(result.total).toBe(2);
      expect(result.items[0].recommendationId).toBe('rec-1');
    });

    it('should search by action', async () => {
      const result = await auditAPI.search({ actions: [AuditAction.RECOMMENDATION_FAILED] });
      expect(result.total).toBe(1);
      expect(result.items[0].recommendationId).toBe('rec-2');
    });

    it('should search by assets', async () => {
      const resultFrom = await auditAPI.search({ fromAsset: 'EURC' });
      expect(resultFrom.total).toBe(1);

      const resultTo = await auditAPI.search({ toAsset: 'XLM' });
      expect(resultTo.total).toBe(3);
    });

    it('should search by status', async () => {
      const result = await auditAPI.search({ status: [AuditStatus.FAILED] });
      expect(result.total).toBe(1);
      expect(result.items[0].recommendationId).toBe('rec-2');
    });

    it('should respect maxSearchResults config limit', async () => {
      // Add more logs to exceed limit
      for (let i = 0; i < 5; i++) {
        auditAPI.logRecommendationAction({
          recommendationId: `rec-limit-${i}`,
          action: AuditAction.RECOMMENDATION_REQUESTED,
          actor: 'user-1',
          fromAsset: 'USDC',
          toAsset: 'XLM',
          amount: '10',
          status: AuditStatus.PENDING,
        });
      }

      const result = await auditAPI.search({});
      expect(result.items.length).toBe(5); // maxSearchResults is configured to 5
      expect(result.total).toBe(8); // total matches in database
    });

    it('should paginate correctly using limit and offset', async () => {
      const result = await auditAPI.search({ limit: 2, offset: 1 });
      expect(result.items.length).toBe(2);
      expect(result.offset).toBe(1);
      expect(result.limit).toBe(2);
    });
  });

  describe('getRecommendationHistory', () => {
    it('should retrieve history for a specific recommendation', async () => {
      auditAPI.logRecommendationAction({
        recommendationId: 'rec-history-1',
        action: AuditAction.RECOMMENDATION_REQUESTED,
        actor: 'user-1',
        fromAsset: 'USDC',
        toAsset: 'XLM',
        amount: '100',
        status: AuditStatus.PENDING,
      });

      const history = await auditAPI.getRecommendationHistory('rec-history-1');
      expect(history.length).toBe(1);
      expect(history[0].recommendationId).toBe('rec-history-1');
    });
  });

  describe('getAuditLog', () => {
    it('should retrieve a specific log by auditId', () => {
      const logged = auditAPI.logRecommendationAction({
        recommendationId: 'rec-get-1',
        action: AuditAction.RECOMMENDATION_REQUESTED,
        actor: 'user-1',
        fromAsset: 'USDC',
        toAsset: 'XLM',
        amount: '100',
        status: AuditStatus.PENDING,
      });

      const retrieved = auditAPI.getAuditLog(logged.auditId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.auditId).toBe(logged.auditId);
    });

    it('should return undefined for non-existent auditId', () => {
      expect(auditAPI.getAuditLog('non-existent-id')).toBeUndefined();
    });
  });
});
