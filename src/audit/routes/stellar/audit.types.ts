/**
 * Audit log entry for a Stellar route recommendation
 */
export interface RouteRecommendationAuditLog {
  auditId: string;
  recommendationId: string;
  timestamp: number;
  action: AuditAction;
  actor: string;

  // Recommendation inputs
  fromAsset: string;
  toAsset: string;
  amount: string;
  sender?: string;

  // Ranking decisions
  selectedRouteId?: string;
  selectedProvider?: string;
  routesConsidered?: number;

  status: AuditStatus;

  details?: Record<string, unknown>;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Types of audit actions
 */
export enum AuditAction {
  RECOMMENDATION_REQUESTED = 'recommendation.requested',
  ROUTES_FETCHED = 'recommendation.routes_fetched',
  ROUTES_RANKED = 'recommendation.routes_ranked',
  RECOMMENDATION_PROVIDED = 'recommendation.provided',
  RECOMMENDATION_FAILED = 'recommendation.failed',
}

/**
 * Status of the recommendation at the time of audit
 */
export enum AuditStatus {
  PENDING = 'pending',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Query parameters for searching audit logs
 */
export interface AuditSearchQuery {
  recommendationIds?: string[];
  actions?: AuditAction[];
  fromAsset?: string;
  toAsset?: string;
  sender?: string;
  status?: AuditStatus[];
  startTime?: number;
  endTime?: number;
  limit?: number;
  offset?: number;
}

/**
 * Result of audit log search
 */
export interface AuditSearchResult {
  total: number;
  offset: number;
  limit: number;
  items: RouteRecommendationAuditLog[];
}

/**
 * Configuration for the audit API
 */
export interface AuditAPIConfig {
  storageBackend: 'memory' | 'postgres' | 'mongodb';
  maxSearchResults: number;
}
