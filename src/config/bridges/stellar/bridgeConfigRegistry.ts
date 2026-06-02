/**
 * File: src/config/bridges/stellar/bridgeConfigRegistry.ts
 *
 * Centralized configuration management for Soroban bridges.
 * Stores bridge configurations and supports runtime updates.
 */

export interface BridgeConfig {
    id: string;
    name: string;
    rpcUrl: string;
    contractAddress: string;
    networkPassphrase: string;
    timeoutMs: number;
    retryAttempts: number;
    feeBumpEnabled: boolean;
    metadata?: Record<string, unknown>;
  }
  
  export type ConfigUpdatePayload = Partial<Omit<BridgeConfig, "id">>;
  
  export interface ConfigChangeEvent {
    bridgeId: string;
    previous: BridgeConfig | null;
    current: BridgeConfig;
    updatedAt: Date;
  }
  
  type ChangeListener = (event: ConfigChangeEvent) => void;
  
  /**
   * BridgeConfigRegistry
   *
   * Singleton registry for managing Soroban bridge configurations at runtime.
   * Supports adding, updating, removing, and watching bridge configurations.
   */
  export class BridgeConfigRegistry {
    private static instance: BridgeConfigRegistry;
    private configs: Map<string, BridgeConfig> = new Map();
    private listeners: Set<ChangeListener> = new Set();
  
    private constructor() {}
  
    static getInstance(): BridgeConfigRegistry {
      if (!BridgeConfigRegistry.instance) {
        BridgeConfigRegistry.instance = new BridgeConfigRegistry();
      }
      return BridgeConfigRegistry.instance;
    }
  
    /**
     * Register a new bridge configuration.
     * Throws if a config with the same id already exists.
     */
    register(config: BridgeConfig): void {
      if (this.configs.has(config.id)) {
        throw new Error(
          `[BridgeConfigRegistry] Config with id "${config.id}" already registered. Use update() to modify it.`
        );
      }
      this.configs.set(config.id, { ...config });
      this.emit({ bridgeId: config.id, previous: null, current: config, updatedAt: new Date() });
    }
  
    /**
     * Retrieve a bridge configuration by id.
     */
    get(id: string): BridgeConfig | undefined {
      return this.configs.get(id);
    }
  
    /**
     * Get all registered configurations.
     */
    getAll(): BridgeConfig[] {
      return Array.from(this.configs.values());
    }
  
    /**
     * Update an existing bridge configuration at runtime.
     * Merges provided fields with the existing config.
     */
    update(id: string, updates: ConfigUpdatePayload): BridgeConfig {
      const existing = this.configs.get(id);
      if (!existing) {
        throw new Error(
          `[BridgeConfigRegistry] No config found for id "${id}". Use register() first.`
        );
      }
      const updated: BridgeConfig = { ...existing, ...updates };
      this.configs.set(id, updated);
      this.emit({ bridgeId: id, previous: existing, current: updated, updatedAt: new Date() });
      return updated;
    }
  
    /**
     * Remove a bridge configuration.
     */
    remove(id: string): boolean {
      return this.configs.delete(id);
    }
  
    /**
     * Check if a config exists.
     */
    has(id: string): boolean {
      return this.configs.has(id);
    }
  
    /**
     * Subscribe to config change events.
     * Returns an unsubscribe function.
     */
    onChange(listener: ChangeListener): () => void {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
  
    /**
     * Reset the registry (useful for testing).
     */
    clear(): void {
      this.configs.clear();
      this.listeners.clear();
    }
  
    private emit(event: ConfigChangeEvent): void {
      this.listeners.forEach((listener) => {
        try {
          listener(event);
        } catch (err) {
          console.error("[BridgeConfigRegistry] Listener error:", err);
        }
      });
    }
  }
  
  // Export a default singleton instance
  export const bridgeConfigRegistry = BridgeConfigRegistry.getInstance();
  
  export default bridgeConfigRegistry;