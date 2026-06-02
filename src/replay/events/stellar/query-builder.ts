/**
 * Event Replay Query Builder
 * Fluent API for building replay filter criteria
 */

import type { ReplayFilterCriteria, ReplayableEventType } from './types';

/**
 * Fluent query builder for replay filters
 */
export class ReplayQueryBuilder {
  private criteria: ReplayFilterCriteria = {};

  /**
   * Filter by start time
   */
  since(date: Date): this {
    this.criteria.startTime = date;
    return this;
  }

  /**
   * Filter by end time
   */
  until(date: Date): this {
    this.criteria.endTime = date;
    return this;
  }

  /**
   * Filter by time range
   */
  between(startDate: Date, endDate: Date): this {
    this.criteria.startTime = startDate;
    this.criteria.endTime = endDate;
    return this;
  }

  /**
   * Filter by last N milliseconds
   */
  lastMs(ms: number): this {
    this.criteria.startTime = new Date(Date.now() - ms);
    this.criteria.endTime = new Date();
    return this;
  }

  /**
   * Filter by last N hours
   */
  lastHours(hours: number): this {
    return this.lastMs(hours * 60 * 60 * 1000);
  }

  /**
   * Filter by last N days
   */
  lastDays(days: number): this {
    return this.lastMs(days * 24 * 60 * 60 * 1000);
  }

  /**
   * Filter by event types
   */
  ofTypes(...types: ReplayableEventType[]): this {
    this.criteria.eventTypes = types;
    return this;
  }

  /**
   * Filter by single event type
   */
  ofType(type: ReplayableEventType): this {
    this.criteria.eventTypes = [type];
    return this;
  }

  /**
   * Filter by from address
   */
  from(address: string): this {
    this.criteria.fromAddress = address;
    return this;
  }

  /**
   * Filter by to address
   */
  to(address: string): this {
    this.criteria.toAddress = address;
    return this;
  }

  /**
   * Filter by addresses (either from or to)
   */
  withAddresses(...addresses: string[]): this {
    this.criteria.addresses = addresses;
    return this;
  }

  /**
   * Filter by contract ID
   */
  forContract(contractId: string): this {
    this.criteria.contractId = contractId;
    return this;
  }

  /**
   * Filter by multiple contract IDs
   */
  forContracts(...contractIds: string[]): this {
    this.criteria.contractIds = contractIds;
    return this;
  }

  /**
   * Filter by transaction hash
   */
  withTransactionHash(hash: string): this {
    this.criteria.transactionHash = hash;
    return this;
  }

  /**
   * Filter by sequence number
   */
  withSequenceNumber(seqNum: number): this {
    this.criteria.sequenceNumber = seqNum;
    return this;
  }

  /**
   * Filter by ledger sequence
   */
  inLedger(ledgerSeq: number): this {
    this.criteria.ledgerSequence = ledgerSeq;
    return this;
  }

  /**
   * Filter by source account
   */
  fromAccount(account: string): this {
    this.criteria.sourceAccount = account;
    return this;
  }

  /**
   * Filter by minimum amount
   */
  minAmount(amount: string | number): this {
    this.criteria.minAmount = amount.toString();
    return this;
  }

  /**
   * Filter by maximum amount
   */
  maxAmount(amount: string | number): this {
    this.criteria.maxAmount = amount.toString();
    return this;
  }

  /**
   * Filter by amount range
   */
  amountBetween(min: string | number, max: string | number): this {
    this.criteria.minAmount = min.toString();
    this.criteria.maxAmount = max.toString();
    return this;
  }

  /**
   * Filter by asset
   */
  withAsset(asset: string): this {
    this.criteria.asset = asset;
    return this;
  }

  /**
   * Filter by multiple assets
   */
  withAssets(...assets: string[]): this {
    this.criteria.assets = assets;
    return this;
  }

  /**
   * Filter by metadata presence
   */
  withMetadata(): this {
    this.criteria.hasMetadata = true;
    return this;
  }

  /**
   * Filter by metadata values
   */
  whereMetadata(pattern: Record<string, any>): this {
    this.criteria.metadataMatches = pattern;
    return this;
  }

  /**
   * Custom filter predicate
   */
  where(predicate: (event: any) => boolean): this {
    this.criteria.predicate = predicate;
    return this;
  }

  /**
   * Set result limit
   */
  limit(limit: number): this {
    this.criteria.limit = limit;
    return this;
  }

  /**
   * Set result offset
   */
  offset(offset: number): this {
    this.criteria.offset = offset;
    return this;
  }

  /**
   * Set pagination
   */
  page(pageNumber: number, pageSize: number = 100): this {
    this.criteria.limit = pageSize;
    this.criteria.offset = (pageNumber - 1) * pageSize;
    return this;
  }

  /**
   * Build the filter criteria
   */
  build(): ReplayFilterCriteria {
    return { ...this.criteria };
  }

  /**
   * Reset the builder
   */
  reset(): this {
    this.criteria = {};
    return this;
  }

  /**
   * Clone the builder
   */
  clone(): ReplayQueryBuilder {
    const builder = new ReplayQueryBuilder();
    builder.criteria = { ...this.criteria };
    if (this.criteria.eventTypes) {
      builder.criteria.eventTypes = [...this.criteria.eventTypes];
    }
    if (this.criteria.addresses) {
      builder.criteria.addresses = [...this.criteria.addresses];
    }
    if (this.criteria.contractIds) {
      builder.criteria.contractIds = [...this.criteria.contractIds];
    }
    if (this.criteria.assets) {
      builder.criteria.assets = [...this.criteria.assets];
    }
    return builder;
  }
}

/**
 * Create a new replay query builder
 */
export function createReplayQuery(): ReplayQueryBuilder {
  return new ReplayQueryBuilder();
}

/**
 * Common query presets
 */
export const ReplayQueryPresets = {
  /**
   * Get all transfer events
   */
  transfers: () => createReplayQuery().ofType('transfer'),

  /**
   * Get all failed transactions from last 24 hours
   */
  recentFailures: () =>
    createReplayQuery().lastDays(1).ofTypes('unknown'),

  /**
   * Get events for a specific contract
   */
  contractEvents: (contractId: string) =>
    createReplayQuery().forContract(contractId),

  /**
   * Get events for a specific address (as sender or receiver)
   */
  addressEvents: (address: string) =>
    createReplayQuery().withAddresses(address),

  /**
   * Get high-value transfers
   */
  highValueTransfers: (minAmount: string) =>
    createReplayQuery()
      .ofType('transfer')
      .minAmount(minAmount),

  /**
   * Get events from a specific ledger
   */
  ledgerEvents: (ledgerSeq: number) =>
    createReplayQuery().inLedger(ledgerSeq),

  /**
   * Get last N events
   */
  recent: (count: number = 100) =>
    createReplayQuery().limit(count),

  /**
   * Get events with errors
   */
  withErrors: () =>
    createReplayQuery().withMetadata().whereMetadata({ error: true }),
};
