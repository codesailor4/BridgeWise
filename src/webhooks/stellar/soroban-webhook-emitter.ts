import { createHmac, randomBytes, randomUUID } from 'crypto';
import { SorobanTransferState } from '../../state-machine/stellar/soroban-transfer-state-machine';
import { NormalizedBridgeEvent } from '../../events/aggregation/stellar';
import {
  RegisterWebhookInput,
  WebhookRegistration,
  WebhookPayload,
  WebhookDeliveryResult,
  StellarWebhookEventType,
  LIFECYCLE_EVENT_MAP,
  TransferLifecycleEventData,
} from './stellar-webhook.types';

/**
 * Emits signed webhook payloads to registered endpoints for Soroban bridge
 * lifecycle events and generic bridge events from the event aggregator.
 *
 * Each delivered request is signed with HMAC-SHA256 so receivers can verify
 * the payload originated from BridgeWise:
 *
 *   X-BridgeWise-Signature: sha256=<hex-digest>
 *
 * Usage:
 *   const emitter = new SorobanWebhookEmitter();
 *   const reg = emitter.register({ url: 'https://my-app.com/hook', events: ['transfer.completed'] });
 *   await emitter.emitLifecycleEvent(transferId, 'confirmed', 'completed');
 */
export class SorobanWebhookEmitter {
  private readonly registrations = new Map<string, WebhookRegistration>();
  private payloadCounter = 0;

  constructor(
    private readonly fetcher: typeof fetch = (...args) => fetch(...args),
  ) {}

  // ---------------------------------------------------------------------------
  // Registration management
  // ---------------------------------------------------------------------------

  /**
   * Register a new webhook endpoint.
   *
   * A cryptographically random 32-byte hex secret is generated when the caller
   * does not provide one. The returned `WebhookRegistration` contains the
   * secret — store it securely; it cannot be retrieved later.
   */
  register(input: RegisterWebhookInput): WebhookRegistration {
    const registration: WebhookRegistration = {
      id: randomUUID(),
      url: input.url,
      events: input.events,
      secret: input.secret ?? randomBytes(32).toString('hex'),
      createdAt: Date.now(),
    };

    this.registrations.set(registration.id, registration);
    return registration;
  }

  /**
   * Remove a registered webhook.
   *
   * @returns `true` if the registration existed and was removed, `false` otherwise.
   */
  unregister(id: string): boolean {
    return this.registrations.delete(id);
  }

  /**
   * Return all current webhook registrations.
   */
  list(): WebhookRegistration[] {
    return Array.from(this.registrations.values());
  }

  // ---------------------------------------------------------------------------
  // Event emission
  // ---------------------------------------------------------------------------

  /**
   * Emit a lifecycle event when a Soroban transfer transitions to a new state.
   *
   * Looks up the matching webhook event type for `toState` and dispatches
   * signed payloads to all subscribed endpoints.
   *
   * @param transferId  Identifier for the transfer (e.g. Stellar transaction hash)
   * @param fromState   Previous state, if known
   * @param toState     New state the transfer transitioned into
   * @param metadata    Optional extra data to include in the payload
   */
  async emitLifecycleEvent(
    transferId: string,
    fromState: SorobanTransferState | undefined,
    toState: SorobanTransferState,
    metadata?: Record<string, unknown>,
  ): Promise<WebhookDeliveryResult[]> {
    const eventType = LIFECYCLE_EVENT_MAP[toState];
    const data: TransferLifecycleEventData = {
      transferId,
      fromState,
      toState,
      timestamp: Date.now(),
      metadata,
    };

    return this.emit(eventType, data as unknown as Record<string, unknown>);
  }

  /**
   * Emit a generic bridge event originating from the SorobanBridgeEventAggregator.
   *
   * Dispatches to all endpoints subscribed to the `bridge.event` event type.
   */
  async emitBridgeEvent(event: NormalizedBridgeEvent): Promise<WebhookDeliveryResult[]> {
    return this.emit('bridge.event', event as unknown as Record<string, unknown>);
  }

  /**
   * Build a signed payload for `eventType` and deliver it in parallel to all
   * registered endpoints that subscribed to this event type.
   */
  async emit(
    eventType: StellarWebhookEventType,
    data: Record<string, unknown>,
  ): Promise<WebhookDeliveryResult[]> {
    this.payloadCounter++;
    const payload: WebhookPayload = {
      id: `whpay_${Date.now()}_${this.payloadCounter}`,
      event: eventType,
      timestamp: Date.now(),
      data,
    };

    const subscribers = Array.from(this.registrations.values()).filter((r) =>
      r.events.includes(eventType),
    );

    return Promise.all(subscribers.map((reg) => this.deliver(reg, payload)));
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /**
   * Sign `payload` and POST it to the registration's URL.
   *
   * Returns a `WebhookDeliveryResult` regardless of success or failure so that
   * callers always receive a complete delivery log.
   */
  private async deliver(
    registration: WebhookRegistration,
    payload: WebhookPayload,
  ): Promise<WebhookDeliveryResult> {
    const body = JSON.stringify(payload);
    const signature = this.sign(body, registration.secret);

    try {
      const response = await this.fetcher(registration.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-BridgeWise-Signature': signature,
          'X-BridgeWise-Event': payload.event,
        },
        body,
      });

      return {
        webhookId: registration.id,
        success: response.ok,
        statusCode: response.status,
        deliveredAt: Date.now(),
      };
    } catch (error) {
      return {
        webhookId: registration.id,
        success: false,
        error: error instanceof Error ? error.message : String(error),
        deliveredAt: Date.now(),
      };
    }
  }

  /**
   * Produce an HMAC-SHA256 signature for `payload` using `secret`.
   * Format: `sha256=<hex-digest>`
   */
  private sign(payload: string, secret: string): string {
    const digest = createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    return `sha256=${digest}`;
  }
}
