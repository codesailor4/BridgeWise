import { EventEmitter } from 'events';

export interface StellarRouteBlacklistEntry {
  routeId: string;
  bridgeId?: string;
  sourceChain?: string;
  destinationChain?: string;
  asset?: string;
  reason?: string;
  addedAt: Date;
  updatedAt: Date;
}

export interface StellarRouteBlacklistOptions {
  initialBlacklist?: Array<Omit<StellarRouteBlacklistEntry, 'addedAt' | 'updatedAt'>>;
}

export interface StellarRouteReference {
  routeId: string;
  bridgeId?: string;
}

export class StellarRouteBlacklistService extends EventEmitter {
  private readonly blacklist = new Map<string, StellarRouteBlacklistEntry>();

  constructor(options: StellarRouteBlacklistOptions = {}) {
    super();
    options.initialBlacklist?.forEach((entry) => {
      this.add(entry.routeId, entry);
    });
  }

  add(
    routeId: string,
    entry: Omit<StellarRouteBlacklistEntry, 'routeId' | 'addedAt' | 'updatedAt'> = {}
  ): StellarRouteBlacklistEntry {
    const normalizedRouteId = routeId?.trim();
    if (!normalizedRouteId) {
      throw new Error('routeId must be a non-empty string');
    }

    const newEntry: StellarRouteBlacklistEntry = {
      routeId: normalizedRouteId,
      bridgeId: entry.bridgeId,
      sourceChain: entry.sourceChain,
      destinationChain: entry.destinationChain,
      asset: entry.asset,
      reason: entry.reason ?? 'blacklisted by security policy',
      addedAt: new Date(),
      updatedAt: new Date(),
    };

    this.blacklist.set(normalizedRouteId, newEntry);
    this.emit('added', newEntry);
    return newEntry;
  }

  remove(routeId: string): boolean {
    const normalizedRouteId = routeId?.trim();
    if (!normalizedRouteId) {
      return false;
    }

    const existed = this.blacklist.delete(normalizedRouteId);
    if (existed) {
      this.emit('removed', normalizedRouteId);
    }
    return existed;
  }

  update(
    routeId: string,
    updates: Partial<Omit<StellarRouteBlacklistEntry, 'routeId' | 'addedAt' | 'updatedAt'>>
  ): StellarRouteBlacklistEntry | null {
    const normalizedRouteId = routeId?.trim();
    if (!normalizedRouteId) {
      throw new Error('routeId must be a non-empty string');
    }

    const current = this.blacklist.get(normalizedRouteId);
    if (!current) {
      return null;
    }

    const updated: StellarRouteBlacklistEntry = {
      ...current,
      ...updates,
      updatedAt: new Date(),
    };

    this.blacklist.set(normalizedRouteId, updated);
    this.emit('updated', updated);
    return updated;
  }

  isBlacklisted(routeId: string): boolean {
    const normalizedRouteId = routeId?.trim();
    if (!normalizedRouteId) {
      return false;
    }
    return this.blacklist.has(normalizedRouteId);
  }

  getEntry(routeId: string): StellarRouteBlacklistEntry | null {
    const normalizedRouteId = routeId?.trim();
    if (!normalizedRouteId) {
      return null;
    }
    return this.blacklist.get(normalizedRouteId) ?? null;
  }

  getAll(): StellarRouteBlacklistEntry[] {
    return [...this.blacklist.values()];
  }

  filterRoutes(routes: StellarRouteReference[]): StellarRouteReference[] {
    return routes.filter((route) => !this.isBlacklisted(route.routeId));
  }

  replaceBlacklist(
    entries: Array<Omit<StellarRouteBlacklistEntry, 'addedAt' | 'updatedAt'>>
  ): void {
    this.blacklist.clear();
    entries.forEach((entry) => this.add(entry.routeId, entry));
    this.emit('replaced', this.getAll());
  }

  clear(): void {
    this.blacklist.clear();
    this.emit('cleared');
  }
}
