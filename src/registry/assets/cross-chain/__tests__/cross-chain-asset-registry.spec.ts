import {
  CrossChainAssetRegistry,
  CrossChainAsset,
  UnknownAssetError,
  AssetRegistrationError,
} from '../cross-chain-asset-registry';

describe('CrossChainAssetRegistry', () => {
  let registry: CrossChainAssetRegistry;

  const usdc: CrossChainAsset = {
    id: 'USDC',
    symbol: 'USDC',
    name: 'USD Coin',
    decimals: 6,
    addresses: {
      'ethereum': '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      'polygon': '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      'bnb-chain': '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    },
    tags: ['stablecoin'],
  };

  const usdt: CrossChainAsset = {
    id: 'USDT',
    symbol: 'USDT',
    name: 'Tether USD',
    decimals: 6,
    addresses: {
      'ethereum': '0xdAC17F958D2ee523a2206206994597C13D831ec7',
      'polygon': '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    },
    tags: ['stablecoin'],
  };

  const weth: CrossChainAsset = {
    id: 'WETH',
    symbol: 'WETH',
    name: 'Wrapped Ether',
    decimals: 18,
    addresses: {
      'ethereum': '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      'polygon': '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
    },
    tags: ['wrapped'],
  };

  beforeEach(() => {
    registry = new CrossChainAssetRegistry();
  });

  describe('register', () => {
    it('registers a single asset', () => {
      registry.register(usdc);
      expect(registry.has('USDC')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('replaces an existing asset with the same id', () => {
      registry.register(usdc);
      const modified = { ...usdc, name: 'USD Coin v2' };
      registry.register(modified);
      expect(registry.size).toBe(1);
      expect(registry.get('USDC')?.name).toBe('USD Coin v2');
    });

    it('throws AssetRegistrationError for invalid id', () => {
      expect(() =>
        registry.register({ ...usdc, id: '' }),
      ).toThrow(AssetRegistrationError);
    });

    it('throws AssetRegistrationError for invalid decimals', () => {
      expect(() =>
        registry.register({ ...usdc, decimals: -1 }),
      ).toThrow(AssetRegistrationError);
    });

    it('throws AssetRegistrationError for empty chain address', () => {
      expect(() =>
        registry.register({
          ...usdc,
          addresses: { ethereum: '' },
        }),
      ).toThrow(AssetRegistrationError);
    });
  });

  describe('registerBatch', () => {
    it('registers multiple assets', () => {
      registry.registerBatch([usdc, usdt, weth]);
      expect(registry.size).toBe(3);
    });

    it('rolls back on validation failure', () => {
      expect(() =>
        registry.registerBatch([usdc, { ...usdt, decimals: -1 }, weth]),
      ).toThrow(AssetRegistrationError);
      expect(registry.size).toBe(0);
    });
  });

  describe('deregister', () => {
    it('removes an asset and its index entries', () => {
      registry.registerBatch([usdc, usdt]);
      expect(registry.deregister('USDC')).toBe(true);
      expect(registry.has('USDC')).toBe(false);
      expect(registry.size).toBe(1);
    });

    it('returns false for non-existent asset', () => {
      expect(registry.deregister('NONEXISTENT')).toBe(false);
    });
  });

  describe('lookup', () => {
    beforeEach(() => {
      registry.registerBatch([usdc, usdt, weth]);
    });

    describe('get', () => {
      it('returns an asset by id', () => {
        expect(registry.get('USDC')?.name).toBe('USD Coin');
      });

      it('returns undefined for unknown id', () => {
        expect(registry.get('FAKE')).toBeUndefined();
      });
    });

    describe('getOrThrow', () => {
      it('returns an asset by id', () => {
        expect(registry.getOrThrow('USDC').symbol).toBe('USDC');
      });

      it('throws UnknownAssetError for unknown id', () => {
        expect(() => registry.getOrThrow('FAKE')).toThrow(UnknownAssetError);
      });
    });

    describe('getBySymbol', () => {
      it('finds assets by symbol', () => {
        const assets = registry.getBySymbol('USDC');
        expect(assets).toHaveLength(1);
        expect(assets[0].id).toBe('USDC');
      });

      it('is case-insensitive', () => {
        const assets = registry.getBySymbol('usdc');
        expect(assets).toHaveLength(1);
      });

      it('returns empty array for unknown symbol', () => {
        expect(registry.getBySymbol('FAKE')).toEqual([]);
      });
    });

    describe('getByChain', () => {
      it('finds assets on a chain', () => {
        const assets = registry.getByChain('ethereum');
        expect(assets).toHaveLength(3);
      });

      it('returns empty array for unknown chain', () => {
        expect(registry.getByChain('solana')).toEqual([]);
      });
    });

    describe('getAddress', () => {
      it('returns the address for a chain', () => {
        const address = registry.getAddress('USDC', 'polygon');
        expect(address).toBe('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
      });

      it('returns undefined when chain not found', () => {
        expect(registry.getAddress('USDC', 'solana')).toBeUndefined();
      });
    });

    describe('getAddressOrThrow', () => {
      it('returns the address for a chain', () => {
        const address = registry.getAddressOrThrow('USDC', 'polygon');
        expect(address).toBe('0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174');
      });

      it('throws UnknownAssetError for missing asset', () => {
        expect(() =>
          registry.getAddressOrThrow('FAKE', 'ethereum'),
        ).toThrow(UnknownAssetError);
      });

      it('throws UnknownAssetError for missing chain address', () => {
        expect(() =>
          registry.getAddressOrThrow('WETH', 'solana'),
        ).toThrow(UnknownAssetError);
      });
    });

    describe('has', () => {
      it('returns true for registered asset', () => {
        expect(registry.has('USDC')).toBe(true);
      });

      it('returns false for unknown asset', () => {
        expect(registry.has('FAKE')).toBe(false);
      });
    });
  });

  describe('bridgeable routes', () => {
    beforeEach(() => {
      registry.registerBatch([usdc, usdt]);
    });

    describe('addBridgeableRoute', () => {
      it('registers a bridgeable route', () => {
        registry.addBridgeableRoute('USDC', 'ethereum', 'polygon');
        expect(
          registry.isBridgeable('USDC', 'ethereum', 'polygon'),
        ).toBe(true);
      });

      it('throws UnknownAssetError for unknown asset', () => {
        expect(() =>
          registry.addBridgeableRoute('FAKE', 'ethereum', 'polygon'),
        ).toThrow(UnknownAssetError);
      });
    });

    describe('isBridgeable', () => {
      it('returns false for unregistered route', () => {
        expect(
          registry.isBridgeable('USDC', 'ethereum', 'polygon'),
        ).toBe(false);
      });
    });

    describe('getBridgeableAssets', () => {
      it('returns assets bridgeable on a route', () => {
        registry.addBridgeableRoute('USDC', 'ethereum', 'polygon');
        registry.addBridgeableRoute('USDT', 'ethereum', 'polygon');

        const assets = registry.getBridgeableAssets('ethereum', 'polygon');
        expect(assets).toHaveLength(2);
        expect(assets.map((a) => a.id).sort()).toEqual(['USDC', 'USDT']);
      });

      it('returns empty array when no route exists', () => {
        expect(
          registry.getBridgeableAssets('ethereum', 'solana'),
        ).toEqual([]);
      });
    });
  });

  describe('getAll', () => {
    it('returns all registered assets', () => {
      registry.registerBatch([usdc, usdt]);
      expect(registry.getAll()).toHaveLength(2);
    });
  });

  describe('stats', () => {
    it('returns correct statistics', () => {
      registry.registerBatch([usdc, usdt, weth]);
      registry.addBridgeableRoute('USDC', 'ethereum', 'polygon');
      registry.addBridgeableRoute('USDT', 'ethereum', 'polygon');

      const s = registry.stats();
      expect(s.totalAssets).toBe(3);
      expect(s.totalChains).toEqual(
        expect.arrayContaining(['bnb-chain', 'ethereum', 'polygon']),
      );
      expect(s.totalRoutes).toBe(1);
    });
  });
});
