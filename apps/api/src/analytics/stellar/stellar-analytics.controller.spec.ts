import { Test, TestingModule } from '@nestjs/testing';
import { StellarAnalyticsController } from './stellar-analytics.controller';
import { StellarAnalyticsService } from './stellar-analytics.service';
import { BridgeAnalyticsQueryDto } from '../dto/bridge-analytics.dto';
import { StellarTimeSeriesQueryDto } from './dto/stellar-analytics.dto';

describe('StellarAnalyticsController', () => {
  let controller: StellarAnalyticsController;
  let service: StellarAnalyticsService;

  const mockStellarAnalyticsService = {
    getStellarAnalytics: jest.fn(),
    getStellarAggregatedMetrics: jest.fn(),
    getStellarTimeSeries: jest.fn(),
  };

  const mockRouteAnalytics = {
    bridgeName: 'stellar-bridge',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    token: 'USDC',
    totalTransfers: 10,
    successfulTransfers: 8,
    failedTransfers: 2,
    successRate: 80,
    failureRate: 20,
    averageSettlementTimeMs: 15000,
    totalVolume: 5000,
    lastUpdated: new Date(),
  };

  const mockAggregatedMetrics = {
    totalVolume: 5000,
    totalTransfers: 10,
    successfulTransfers: 8,
    failedTransfers: 2,
    successRate: 80,
    averageSettlementTimeMs: 15000,
    averageFee: 0.01,
    averageSlippagePercent: 0.1,
    routeCount: 1,
    generatedAt: new Date(),
  };

  const mockTimeSeries = {
    bridgeName: 'stellar-bridge',
    sourceChain: 'stellar',
    destinationChain: 'ethereum',
    granularity: 'day',
    data: [
      {
        timestamp: new Date(),
        transfers: 10,
        successfulTransfers: 8,
        failedTransfers: 2,
        totalVolume: 5000,
      },
    ],
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StellarAnalyticsController],
      providers: [
        {
          provide: StellarAnalyticsService,
          useValue: mockStellarAnalyticsService,
        },
      ],
    }).compile();

    controller = module.get<StellarAnalyticsController>(StellarAnalyticsController);
    service = module.get<StellarAnalyticsService>(StellarAnalyticsService);

    jest.clearAllMocks();
  });

  describe('getStellarAnalytics', () => {
    it('should return paginated Stellar route analytics', async () => {
      const mockResponse = {
        data: [mockRouteAnalytics],
        total: 1,
        page: 1,
        limit: 50,
        totalPages: 1,
        generatedAt: new Date(),
      };

      mockStellarAnalyticsService.getStellarAnalytics.mockResolvedValue(mockResponse);

      const query: BridgeAnalyticsQueryDto = {
        page: 1,
        limit: 50,
      };

      const result = await controller.getStellarAnalytics(query);

      expect(result).toEqual(mockResponse);
      expect(mockStellarAnalyticsService.getStellarAnalytics).toHaveBeenCalledWith(query);
    });
  });

  describe('getStellarAggregatedMetrics', () => {
    it('should return aggregated Stellar metrics', async () => {
      mockStellarAnalyticsService.getStellarAggregatedMetrics.mockResolvedValue(mockAggregatedMetrics);

      const query: BridgeAnalyticsQueryDto = {
        bridgeName: 'stellar-bridge',
      };

      const result = await controller.getStellarAggregatedMetrics(query);

      expect(result).toEqual(mockAggregatedMetrics);
      expect(mockStellarAnalyticsService.getStellarAggregatedMetrics).toHaveBeenCalledWith(query);
    });
  });

  describe('getStellarTimeSeries', () => {
    it('should return time series data for Stellar routes', async () => {
      mockStellarAnalyticsService.getStellarTimeSeries.mockResolvedValue(mockTimeSeries);

      const query: StellarTimeSeriesQueryDto = {
        granularity: 'day',
        startDate: '2026-06-01T00:00:00.000Z',
        endDate: '2026-06-02T00:00:00.000Z',
      };

      const result = await controller.getStellarTimeSeries(query);

      expect(result).toEqual(mockTimeSeries);
      expect(mockStellarAnalyticsService.getStellarTimeSeries).toHaveBeenCalledWith(query);
    });
  });
});
