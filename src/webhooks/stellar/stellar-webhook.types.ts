import { SorobanTransferState } from '../../state-machine/stellar/soroban-transfer-state-machine';

/**
 * All Stellar/Soroban bridge lifecycle event types that can be dispatched
 * to registered webhook endpoints.
 */
export type StellarWebhookEventType =
  | 'transfer.initiated'
  | 'transfer.locked'
  | 'transfer.validated'
  | 'transfer.submitted'
  | 'transfer.confirmed'
  | 'transfer.completed'
  | 'transfer.failed'
  | 'transfer.refunded'
  | 'bridge.event';

/**
 * Maps each Soroban transfer state to the corresponding webhook event type.
 */
export const LIFECYCLE_EVENT_MAP: Record<SorobanTransferState, StellarWebhookEventType> = {
  pending: 'transfer.initiated',
  locked: 'transfer.locked',
  validated: 'transfer.validated',
  submitted: 'transfer.submitted',
  confirmed: 'transfer.confirmed',
  completed: 'transfer.completed',
  failed: 'transfer.failed',
  refunded: 'transfer.refunded',
};

/**
 * Input used to register a new webhook endpoint.
 */
export interface RegisterWebhookInput {
  /** HTTPS URL that will receive POST requests for each matching event */
  url: string;
  /** Event types this webhook should receive */
  events: StellarWebhookEventType[];
  /**
   * Optional signing secret used to produce the HMAC-SHA256 signature.
   * If omitted, a cryptographically random 32-byte hex secret is generated.
   */
  secret?: string;
}

/**
 * A registered webhook with its generated id and secret.
 */
export interface WebhookRegistration {
  id: string;
  url: string;
  events: StellarWebhookEventType[];
  /** HMAC signing secret — keep this confidential */
  secret: string;
  createdAt: number;
}

/**
 * The JSON body delivered to a webhook URL.
 */
export interface WebhookPayload<T = Record<string, unknown>> {
  /** Unique payload identifier */
  id: string;
  event: StellarWebhookEventType;
  timestamp: number;
  data: T;
}

/**
 * Outcome of a single webhook delivery attempt.
 */
export interface WebhookDeliveryResult {
  webhookId: string;
  success: boolean;
  statusCode?: number;
  error?: string;
  deliveredAt: number;
}

/**
 * Data attached to a transfer lifecycle webhook payload.
 */
export interface TransferLifecycleEventData {
  transferId: string;
  fromState?: SorobanTransferState;
  toState: SorobanTransferState;
  timestamp: number;
  metadata?: Record<string, unknown>;
}
