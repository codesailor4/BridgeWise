import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, Between, In } from 'typeorm';
import { StellarAnalyticsService } from './stellar-analytics.service';
import { BridgeAnalytics } from '../entities/bridge-analytics.entity';
import { BridgeAnalyticsQueryDto } from '../dto/bridge-analytics.dto';

// Mock chains configuration
jest.mock('../../config/chains.config', () => ({
  getAllChains: jest.fn(() => [
    {
      id: 'stellar',
      name: 'Stellar',
      symbol: 'XLM',
      type: 'Stellar',
      features: { supportsBridging: true },
    },
    {
      id: 'stellar-testnet',
      name: 'Stellar Testnet',
      symbol: 'XLM',
      type: 'Stellar',
      features: { supportsBridging: true },
    },
    {
      id: 'ethereum',
      name: 'Ethereum',
      symbol: 'ETH',
      type: 'EVM',
      features: { supportsBridging: true },
    },
  ]),
}));

describe('StellarAnalyticsService', () => {
  let service: StellarAnalyticsService;
  let repository: Repository<BridgeAnalytics>;

  const mockStellarAnalytics: BridgeAnalytics = {
    id: 'test-stellar-id',
    bridgeName: 'stellar-bridge',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    token: 'USDC',
    totalTransfers: 10,
    successfulTransfers: 8,
    failedTransfers: 2,
    averageSettlementTimeMs: 15000,
    averageFee: 0.01,
    averageSlippagePercent: 0.1,
    totalVolume: 5000,
    minSettlementTimeMs: 10000,
    maxSettlementTimeMs: 25000,
    lastUpdated: new Date(),
    createdAt: new Date(),
    successRate: 80,
    failureRate: 20,
  };

  const mockRepository = {
    find: jest.fn(),
    findAndCount: jest.fn(),
    query: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarAnalyticsService,
        {
          provide: getRepositoryToken(BridgeAnalytics),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<StellarAnalyticsService>(StellarAnalyticsService);
    repository = module.get<Repository<BridgeAnalytics>>(
      getRepositoryToken(BridgeAnalytics),
    );

    jest.clearAllMocks();
  });

  describe('getStellarAnalytics', () => {
    it('should return paginated Stellar bridge analytics', async () => {
      const query: BridgeAnalyticsQueryDto = {
        page: 1,
        limit: 10,
      };

      mockRepository.findAndCount.mockResolvedValue([[mockStellarAnalytics], 1]);

      const result = await service.getStellarAnalytics(query);

      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(mockRepository.findAndCount).toHaveBeenCalled();

      const callArgs = mockRepository.findAndCount.mock.calls[0][0];
      expect(callArgs.where).toHaveLength(2);
      expect(callArgs.where[0].sourceChain).toBeDefined();
      expect(callArgs.where[1].destinationChain).toBeDefined();
    });

    it('should filter by specific source and destination when Stellar chain is involved', async () => {
      const query: BridgeAnalyticsQueryDto = {
        sourceChain: 'stellar',
        destinationChain: 'ethereum',
        page: 1,
        limit: 10,
      };

      mockRepository.findAndCount.mockResolvedValue([[mockStellarAnalytics], 1]);

      const result = await service.getStellarAnalytics(query);

      expect(result.data).toHaveLength(1);
      const callArgs = mockRepository.findAndCount.mock.calls[0][0];
      expect(callArgs.where).toHaveLength(1);
      expect(callArgs.where[0].sourceChain).toBe('stellar');
      expect(callArgs.where[0].destinationChain).toBe('ethereum');
    });

    it('should return empty result if filtered source and destination are both non-Stellar', async () => {
      const query: BridgeAnalyticsQueryDto = {
        sourceChain: 'ethereum',
        destinationChain: 'polygon',
      };

      const result = await service.getStellarAnalytics(query);

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(mockRepository.findAndCount).not.toHaveBeenCalled();
    });
  });

  describe('getStellarAggregatedMetrics', () => {
    it('should correctly aggregate metrics across matching Stellar routes', async () => {
      const mockRoutes = [
        {
          ...mockStellarAnalytics,
          totalTransfers: 10,
          successfulTransfers: 8,
          failedTransfers: 2,
          totalVolume: 1000,
          averageSettlementTimeMs: 10000,
          averageFee: 0.1,
          averageSlippagePercent: 0.05,
        },
        {
          ...mockStellarAnalytics,
          totalTransfers: 20,
          successfulTransfers: 18,
          failedTransfers: 2,
          totalVolume: 3000,
          averageSettlementTimeMs: 20000,
          averageFee: 0.2,
          averageSlippagePercent: 0.1,
        },
      ];

      mockRepository.find.mockResolvedValue(mockRoutes);

      const result = await service.getStellarAggregatedMetrics({});

      expect(result.totalVolume).toBe(4000);
      expect(result.totalTransfers).toBe(30);
      expect(result.successfulTransfers).toBe(26);
      expect(result.failedTransfers).toBe(4);
      expect(result.successRate).toBeCloseTo(86.6667, 2);
      
      // Weighted average check:
      // Settlement time: ((10000 * 8) + (20000 * 18)) / 26 = 16923
      expect(result.averageSettlementTimeMs).toBe(16923);
      
      // Weighted average fee: ((0.1 * 10) + (0.2 * 20)) / 30 = 0.1666666667
      expect(result.averageFee).toBeCloseTo(0.1666666667, 6);
    });
  });

  describe('getStellarTimeSeries', () => {
    it('should query bridge_benchmarks and return time series data', async () => {
      const mockRawData = [
        {
          timestamp: '2026-06-01T00:00:00Z',
          transfers: '5',
          successful_transfers: '4',
          failed_transfers: '1',
          avg_settlement_time: '12000',
          avg_amount: '100',
          total_volume: '500',
        },
      ];

      mockRepository.query.mockResolvedValue(mockRawData);

      const result = await service.getStellarTimeSeries({
        granularity: 'day',
        startDate: '2026-06-01T00:00:00Z',
        endDate: '2026-06-02T00:00:00Z',
      });

      expect(result.granularity).toBe('day');
      expect(result.data).toHaveLength(1);
      expect(result.data[0].transfers).toBe(5);
      expect(result.data[0].successfulTransfers).toBe(4);
      expect(result.data[0].failedTransfers).toBe(1);
      expect(result.data[0].averageSettlementTimeMs).toBe(12000);
      expect(result.data[0].totalVolume).toBe(500);
      expect(mockRepository.query).toHaveBeenCalled();
    });
  });
});
