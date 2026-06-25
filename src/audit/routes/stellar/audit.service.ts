import {
  RouteRecommendationAuditLog,
  AuditSearchQuery,
  AuditSearchResult,
  AuditAPIConfig,
} from './audit.types';
import { randomUUID } from 'crypto';

/**
 * Service for storing and retrieving Stellar route recommendation audit logs.
 * Provides searchable audit trail for recommendation history.
 */
export class StellarRouteAuditAPI {
  private readonly config: AuditAPIConfig;
  private auditLogs: Map<string, RouteRecommendationAuditLog> = new Map();
  private indexByRecommendationId: Map<string, string[]> = new Map();
  private indexByAsset: Map<string, string[]> = new Map();

  constructor(config: Partial<AuditAPIConfig> = {}) {
    this.config = {
      storageBackend: config.storageBackend || 'memory',
      maxSearchResults: config.maxSearchResults || 10000,
    };
  }

  /**
   * Log a route recommendation action to the audit trail
   */
  logRecommendationAction(
    log: Omit<RouteRecommendationAuditLog, 'auditId' | 'timestamp'>,
  ): RouteRecommendationAuditLog {
    const auditLog: RouteRecommendationAuditLog = {
      ...log,
      auditId: randomUUID(),
      timestamp: Date.now(),
    };

    this.auditLogs.set(auditLog.auditId, auditLog);
    this.updateIndexes(auditLog);

    return auditLog;
  }

  /**
   * Search audit logs with flexible query parameters
   */
  async search(query: AuditSearchQuery): Promise<AuditSearchResult> {
    let logs = Array.from(this.auditLogs.values());

    if (query.recommendationIds && query.recommendationIds.length > 0) {
      const idSet = new Set(query.recommendationIds);
      logs = logs.filter((log) => idSet.has(log.recommendationId));
    }

    if (query.actions && query.actions.length > 0) {
      const actionSet = new Set(query.actions);
      logs = logs.filter((log) => actionSet.has(log.action));
    }

    if (query.fromAsset) {
      logs = logs.filter((log) => log.fromAsset === query.fromAsset);
    }

    if (query.toAsset) {
      logs = logs.filter((log) => log.toAsset === query.toAsset);
    }

    if (query.sender) {
      logs = logs.filter((log) => log.sender === query.sender);
    }

    if (query.status && query.status.length > 0) {
      const statusSet = new Set(query.status);
      logs = logs.filter((log) => statusSet.has(log.status));
    }

    if (query.startTime !== undefined) {
      logs = logs.filter((log) => log.timestamp >= query.startTime);
    }
    if (query.endTime !== undefined) {
      logs = logs.filter((log) => log.timestamp <= query.endTime);
    }

    logs.sort((a, b) => b.timestamp - a.timestamp);

    const offset = query.offset || 0;
    const limit = Math.min(
      query.limit || this.config.maxSearchResults,
      this.config.maxSearchResults,
    );
    const paginatedLogs = logs.slice(offset, offset + limit);

    return {
      total: logs.length,
      offset,
      limit,
      items: paginatedLogs,
    };
  }

  /**
   * Get all audit logs for a specific recommendation
   */
  async getRecommendationHistory(
    recommendationId: string,
  ): Promise<RouteRecommendationAuditLog[]> {
    const result = await this.search({ recommendationIds: [recommendationId] });
    return result.items;
  }

  /**
   * Get a specific audit log by ID
   */
  getAuditLog(auditId: string): RouteRecommendationAuditLog | undefined {
    return this.auditLogs.get(auditId);
  }

  // Private methods

  private updateIndexes(log: RouteRecommendationAuditLog): void {
    // Index by recommendation ID
    const recLogs =
      this.indexByRecommendationId.get(log.recommendationId) || [];
    recLogs.push(log.auditId);
    this.indexByRecommendationId.set(log.recommendationId, recLogs);

    // Index by asset
    const fromAssetLogs = this.indexByAsset.get(log.fromAsset) || [];
    if (!fromAssetLogs.includes(log.auditId)) {
      fromAssetLogs.push(log.auditId);
    }
    this.indexByAsset.set(log.fromAsset, fromAssetLogs);

    if (log.toAsset !== log.fromAsset) {
      const toAssetLogs = this.indexByAsset.get(log.toAsset) || [];
      if (!toAssetLogs.includes(log.auditId)) {
        toAssetLogs.push(log.auditId);
      }
      this.indexByAsset.set(log.toAsset, toAssetLogs);
    }
  }
}
