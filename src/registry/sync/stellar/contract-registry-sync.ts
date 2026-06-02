import { ContractInfo } from '../../../validation/contracts/stellar/soroban-contract-compatibility-validator';

export class ContractRegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContractRegistryError';
  }
}

export class UnknownContractError extends Error {
  constructor(contractId: string) {
    super(`Unknown contract: "${contractId}"`);
    this.name = 'UnknownContractError';
  }
}

export interface SorobanContractRegistryEntry extends ContractInfo {
  registeredAt: number;
  lastSeenAt: number;
}

export interface ContractRegistrySyncReport {
  added: string[];
  updated: string[];
  unchanged: string[];
  stale: string[];
}

export class SorobanContractRegistry {
  private readonly records = new Map<string, SorobanContractRegistryEntry>();
  private staleContractIds = new Set<string>();

  register(contract: ContractInfo): SorobanContractRegistryEntry {
    this.validateContractInfo(contract);

    const normalizedId = this.normalizeContractId(contract.contractId);
    const now = Date.now();
    const entry: SorobanContractRegistryEntry = {
      ...contract,
      contractId: normalizedId,
      registeredAt: now,
      lastSeenAt: now,
    };

    this.records.set(normalizedId, entry);
    this.staleContractIds.delete(normalizedId);
    return entry;
  }

  registerBatch(contracts: ContractInfo[]): void {
    for (const contract of contracts) {
      this.validateContractInfo(contract);
    }
    for (const contract of contracts) {
      this.register(contract);
    }
  }

  deregister(contractId: string): boolean {
    const normalizedId = this.normalizeContractId(contractId);
    this.staleContractIds.delete(normalizedId);
    return this.records.delete(normalizedId);
  }

  get(contractId: string): SorobanContractRegistryEntry | undefined {
    return this.records.get(this.normalizeContractId(contractId));
  }

  getOrThrow(contractId: string): SorobanContractRegistryEntry {
    const record = this.get(contractId);
    if (!record) {
      throw new UnknownContractError(contractId);
    }
    return record;
  }

  has(contractId: string): boolean {
    return this.records.has(this.normalizeContractId(contractId));
  }

  getAll(): SorobanContractRegistryEntry[] {
    return Array.from(this.records.values());
  }

  getStaleEntries(): SorobanContractRegistryEntry[] {
    return Array.from(this.staleContractIds)
      .map((contractId) => this.records.get(contractId))
      .filter((entry): entry is SorobanContractRegistryEntry => Boolean(entry));
  }

  isStale(contractId: string): boolean {
    return this.staleContractIds.has(this.normalizeContractId(contractId));
  }

  sync(records: ContractInfo[]): ContractRegistrySyncReport {
    const now = Date.now();
    const updatedIds: string[] = [];
    const addedIds: string[] = [];
    const unchangedIds: string[] = [];

    const validatedRecords = records.map((record) => {
      this.validateContractInfo(record);
      return {
        ...record,
        contractId: this.normalizeContractId(record.contractId),
      };
    });

    const incomingIds = new Set(validatedRecords.map((record) => record.contractId));
    const staleIds = Array.from(this.records.keys()).filter(
      (contractId) => !incomingIds.has(contractId),
    );

    this.staleContractIds = new Set(staleIds);

    for (const record of validatedRecords) {
      const existing = this.records.get(record.contractId);
      if (!existing) {
        addedIds.push(record.contractId);
        this.records.set(record.contractId, {
          ...record,
          registeredAt: now,
          lastSeenAt: now,
        });
        continue;
      }

      if (
        existing.wasmHash !== record.wasmHash ||
        existing.version !== record.version ||
        existing.network !== record.network ||
        !this.areInterfacesEqual(existing.interfaces, record.interfaces)
      ) {
        updatedIds.push(record.contractId);
        this.records.set(record.contractId, {
          ...record,
          registeredAt: existing.registeredAt,
          lastSeenAt: now,
        });
        continue;
      }

      unchangedIds.push(record.contractId);
      existing.lastSeenAt = now;
    }

    return {
      added: addedIds,
      updated: updatedIds,
      unchanged: unchangedIds,
      stale: staleIds,
    };
  }

  cleanupStaleEntries(): string[] {
    const removed: string[] = [];
    for (const contractId of this.staleContractIds) {
      if (this.records.delete(contractId)) {
        removed.push(contractId);
      }
    }
    this.staleContractIds.clear();
    return removed;
  }

  private normalizeContractId(contractId: string): string {
    if (!contractId || typeof contractId !== 'string') {
      throw new ContractRegistryError('contractId must be a non-empty string');
    }
    return contractId.trim().toUpperCase();
  }

  private validateContractInfo(contract: ContractInfo): void {
    if (!contract) {
      throw new ContractRegistryError('Contract data is required');
    }
    this.normalizeContractId(contract.contractId);

    if (!contract.wasmHash || typeof contract.wasmHash !== 'string') {
      throw new ContractRegistryError('wasmHash must be a non-empty string');
    }

    if (!Array.isArray(contract.interfaces) || contract.interfaces.length === 0) {
      throw new ContractRegistryError('interfaces must be a non-empty array');
    }

    for (const iface of contract.interfaces) {
      if (!iface || typeof iface !== 'string') {
        throw new ContractRegistryError('interfaces must contain only non-empty strings');
      }
    }

    if (!contract.version || typeof contract.version !== 'string') {
      throw new ContractRegistryError('version must be a non-empty string');
    }

    if (!['mainnet', 'testnet', 'futurenet'].includes(contract.network)) {
      throw new ContractRegistryError(
        'network must be one of mainnet, testnet, or futurenet',
      );
    }
  }

  private areInterfacesEqual(
    existing: readonly string[],
    incoming: readonly string[],
  ): boolean {
    if (existing.length !== incoming.length) {
      return false;
    }
    const set = new Set(existing);
    return incoming.every((iface) => set.has(iface));
  }
}
