import { SorobanContractRegistry } from '../contract-registry-sync';

type ContractInfo = {
  contractId: string;
  wasmHash: string;
  interfaces: string[];
  version: string;
  network: 'mainnet' | 'testnet' | 'futurenet';
};

describe('SorobanContractRegistry', () => {
  let registry: SorobanContractRegistry;

  beforeEach(() => {
    registry = new SorobanContractRegistry();
  });

  it('adds new contract records through sync', () => {
    const record: ContractInfo = {
      contractId: 'C_ABC123',
      wasmHash: 'wasm-hash-1',
      interfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
      version: '1.0',
      network: 'mainnet',
    };

    const report = registry.sync([record]);

    expect(report.added).toEqual(['C_ABC123']);
    expect(report.updated).toEqual([]);
    expect(report.unchanged).toEqual([]);
    expect(report.stale).toEqual([]);
    expect(registry.has('C_ABC123')).toBe(true);
  });

  it('marks a previously known contract as stale when missing from the latest sync', () => {
    const firstRecord: ContractInfo = {
      contractId: 'C_OLD',
      wasmHash: 'wasm-hash-old',
      interfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
      version: '1.0',
      network: 'mainnet',
    };

    const secondRecord: ContractInfo = {
      contractId: 'C_NEW',
      wasmHash: 'wasm-hash-new',
      interfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
      version: '1.0',
      network: 'mainnet',
    };

    registry.sync([firstRecord]);
    const report = registry.sync([secondRecord]);

    expect(report.added).toEqual(['C_NEW']);
    expect(report.stale).toEqual(['C_OLD']);
    expect(registry.isStale('C_OLD')).toBe(true);
    expect(registry.getStaleEntries().map((entry) => entry.contractId)).toEqual([
      'C_OLD',
    ]);
  });

  it('updates a contract record when its metadata changes', () => {
    const initial: ContractInfo = {
      contractId: 'C_UPDATE',
      wasmHash: 'wasm-hash-1',
      interfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
      version: '1.0',
      network: 'mainnet',
    };

    registry.sync([initial]);

    const updated: ContractInfo = {
      contractId: 'C_UPDATE',
      wasmHash: 'wasm-hash-2',
      interfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
      version: '1.1',
      network: 'mainnet',
    };

    const report = registry.sync([updated]);

    expect(report.updated).toEqual(['C_UPDATE']);
    expect(report.stale).toEqual([]);
    expect(registry.get('C_UPDATE')?.wasmHash).toBe('wasm-hash-2');
    expect(registry.get('C_UPDATE')?.version).toBe('1.1');
  });

  it('keeps contract records unchanged when the synced metadata is identical', () => {
    const initial: ContractInfo = {
      contractId: 'C_KEEP',
      wasmHash: 'wasm-hash-1',
      interfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
      version: '1.0',
      network: 'mainnet',
    };

    registry.sync([initial]);
    const report = registry.sync([initial]);

    expect(report.unchanged).toEqual(['C_KEEP']);
    expect(report.added).toEqual([]);
    expect(report.updated).toEqual([]);
    expect(report.stale).toEqual([]);
  });

  it('removes stale contract entries when cleanup is requested', () => {
    const record: ContractInfo = {
      contractId: 'C_REMOVABLE',
      wasmHash: 'wasm-hash-1',
      interfaces: ['SEP-41', 'transfer', 'balance', 'approve'],
      version: '1.0',
      network: 'mainnet',
    };

    registry.sync([record]);
    registry.sync([]);

    expect(registry.getStaleEntries().length).toBe(1);

    const removed = registry.cleanupStaleEntries();

    expect(removed).toEqual(['C_REMOVABLE']);
    expect(registry.has('C_REMOVABLE')).toBe(false);
    expect(registry.getStaleEntries()).toEqual([]);
  });
});
