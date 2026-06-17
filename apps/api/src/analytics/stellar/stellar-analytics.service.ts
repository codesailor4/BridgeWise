import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, In, FindOptionsWhere } from 'typeorm';
import { BridgeAnalytics } from '../entities/bridge-analytics.entity';
import {
  BridgeAnalyticsQueryDto,
  BridgeAnalyticsResponseDto,
  RouteAnalyticsDto,
  TimeSeriesAnalyticsDto,
  TimeSeriesDataPointDto,
} from '../dto/bridge-analytics.dto';
import {
  StellarAggregatedMetricsDto,
  StellarTimeSeriesQueryDto,
} from './dto/stellar-analytics.dto';
import { getAllChains } from '../../config/chains.config';

/**
 * Stellar Analytics Service
 *
 * Provides dedicated analytics logic for Stellar and Soroban routes.
 */
@Injectable()
export class StellarAnalyticsService {
  private readonly logger = new Logger(StellarAnalyticsService.name);

  constructor(
    @InjectRepository(BridgeAnalytics)
    private readonly analyticsRepository: Repository<BridgeAnalytics>,
  ) {}

  /**
   * Get route-by-route Stellar analytics
   */
  async getStellarAnalytics(
    query: BridgeAnalyticsQueryDto,
  ): Promise<BridgeAnalyticsResponseDto> {
    const stellarChains = getAllChains()
      .filter((chain) => chain.type === 'Stellar')
      .map((chain) => chain.id.toLowerCase());

    if (stellarChains.length === 0) {
      return {
        data: [],
        total: 0,
        page: query.page ?? 1,
        limit: query.limit ?? 50,
        totalPages: 0,
        generatedAt: new Date(),
      };
    }

    const whereConditions: FindOptionsWhere<BridgeAnalytics>[] = [];
    const configCaseIds = getAllChains()
      .filter((chain) => chain.type === 'Stellar')
      .map((chain) => chain.id);

    const buildCondition = (base: FindOptionsWhere<BridgeAnalytics>) => {
      const cond = { ...base };
      if (query.bridgeName) {
        cond.bridgeName = query.bridgeName;
      }
      if (query.token) {
        cond.token = query.token;
      }
      if (query.startDate && query.endDate) {
        cond.lastUpdated = Between(
          new Date(query.startDate),
          new Date(query.endDate),
        );
      }
      return cond;
    };

    if (query.sourceChain && query.destinationChain) {
      const isSrcStellar = stellarChains.includes(query.sourceChain.toLowerCase());
      const isDestStellar = stellarChains.includes(query.destinationChain.toLowerCase());

      if (isSrcStellar || isDestStellar) {
        whereConditions.push(
          buildCondition({
            sourceChain: query.sourceChain,
            destinationChain: query.destinationChain,
          }),
        );
      } else {
        return {
          data: [],
          total: 0,
          page: query.page ?? 1,
          limit: query.limit ?? 50,
          totalPages: 0,
          generatedAt: new Date(),
        };
      }
    } else if (query.sourceChain) {
      const isSrcStellar = stellarChains.includes(query.sourceChain.toLowerCase());
      if (isSrcStellar) {
        whereConditions.push(
          buildCondition({
            sourceChain: query.sourceChain,
          }),
        );
      } else {
        whereConditions.push(
          buildCondition({
            sourceChain: query.sourceChain,
            destinationChain: In(configCaseIds),
          }),
        );
      }
    } else if (query.destinationChain) {
      const isDestStellar = stellarChains.includes(query.destinationChain.toLowerCase());
      if (isDestStellar) {
        whereConditions.push(
          buildCondition({
            destinationChain: query.destinationChain,
          }),
        );
      } else {
        whereConditions.push(
          buildCondition({
            sourceChain: In(configCaseIds),
            destinationChain: query.destinationChain,
          }),
        );
      }
    } else {
      whereConditions.push(
        buildCondition({
          sourceChain: In(configCaseIds),
        }),
      );
      whereConditions.push(
        buildCondition({
          destinationChain: In(configCaseIds),
        }),
      );
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 50;

    const [data, total] = await this.analyticsRepository.findAndCount({
      where: whereConditions,
      order: { totalVolume: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const mappedData = data.map((entity) => this.mapToRouteAnalyticsDto(entity));

    return {
      data: mappedData,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
      generatedAt: new Date(),
    };
  }

  /**
   * Get overall aggregated metrics across Stellar routes
   */
  async getStellarAggregatedMetrics(
    query: BridgeAnalyticsQueryDto,
  ): Promise<StellarAggregatedMetricsDto> {
    const stellarChains = getAllChains()
      .filter((chain) => chain.type === 'Stellar')
      .map((chain) => chain.id.toLowerCase());

    if (stellarChains.length === 0) {
      return {
        totalVolume: 0,
        totalTransfers: 0,
        successfulTransfers: 0,
        failedTransfers: 0,
        successRate: 0,
        averageSettlementTimeMs: null,
        averageFee: null,
        averageSlippagePercent: null,
        routeCount: 0,
        generatedAt: new Date(),
      };
    }

    const whereConditions: FindOptionsWhere<BridgeAnalytics>[] = [];
    const configCaseIds = getAllChains()
      .filter((chain) => chain.type === 'Stellar')
      .map((chain) => chain.id);

    const buildCondition = (base: FindOptionsWhere<BridgeAnalytics>) => {
      const cond = { ...base };
      if (query.bridgeName) cond.bridgeName = query.bridgeName;
      if (query.token) cond.token = query.token;
      if (query.startDate && query.endDate) {
        cond.lastUpdated = Between(
          new Date(query.startDate),
          new Date(query.endDate),
        );
      }
      return cond;
    };

    if (query.sourceChain && query.destinationChain) {
      const isSrcStellar = stellarChains.includes(query.sourceChain.toLowerCase());
      const isDestStellar = stellarChains.includes(query.destinationChain.toLowerCase());
      if (isSrcStellar || isDestStellar) {
        whereConditions.push(
          buildCondition({
            sourceChain: query.sourceChain,
            destinationChain: query.destinationChain,
          }),
        );
      }
    } else if (query.sourceChain) {
      const isSrcStellar = stellarChains.includes(query.sourceChain.toLowerCase());
      if (isSrcStellar) {
        whereConditions.push(buildCondition({ sourceChain: query.sourceChain }));
      } else {
        whereConditions.push(
          buildCondition({
            sourceChain: query.sourceChain,
            destinationChain: In(configCaseIds),
          }),
        );
      }
    } else if (query.destinationChain) {
      const isDestStellar = stellarChains.includes(query.destinationChain.toLowerCase());
      if (isDestStellar) {
        whereConditions.push(buildCondition({ destinationChain: query.destinationChain }));
      } else {
        whereConditions.push(
          buildCondition({
            sourceChain: In(configCaseIds),
            destinationChain: query.destinationChain,
          }),
        );
      }
    } else {
      whereConditions.push(buildCondition({ sourceChain: In(configCaseIds) }));
      whereConditions.push(buildCondition({ destinationChain: In(configCaseIds) }));
    }

    if (whereConditions.length === 0) {
      return {
        totalVolume: 0,
        totalTransfers: 0,
        successfulTransfers: 0,
        failedTransfers: 0,
        successRate: 0,
        averageSettlementTimeMs: null,
        averageFee: null,
        averageSlippagePercent: null,
        routeCount: 0,
        generatedAt: new Date(),
      };
    }

    const routes = await this.analyticsRepository.find({
      where: whereConditions,
    });

    let totalVolume = 0;
    let totalTransfers = 0;
    let successfulTransfers = 0;
    let failedTransfers = 0;

    let sumWeightedSettlementTime = 0;
    let sumWeightedFee = 0;
    let sumWeightedSlippage = 0;

    let totalSuccessForWeights = 0;
    let totalTransfersForFeeWeights = 0;
    let totalTransfersForSlippageWeights = 0;

    for (const route of routes) {
      totalVolume += Number(route.totalVolume) || 0;
      totalTransfers += route.totalTransfers;
      successfulTransfers += route.successfulTransfers;
      failedTransfers += route.failedTransfers;

      if (route.averageSettlementTimeMs !== null && route.averageSettlementTimeMs !== undefined) {
        const avgSettlement = Number(route.averageSettlementTimeMs);
        sumWeightedSettlementTime += avgSettlement * route.successfulTransfers;
        totalSuccessForWeights += route.successfulTransfers;
      }

      if (route.averageFee !== null && route.averageFee !== undefined) {
        const avgFee = Number(route.averageFee);
        sumWeightedFee += avgFee * route.totalTransfers;
        totalTransfersForFeeWeights += route.totalTransfers;
      }

      if (route.averageSlippagePercent !== null && route.averageSlippagePercent !== undefined) {
        const avgSlippage = Number(route.averageSlippagePercent);
        sumWeightedSlippage += avgSlippage * route.totalTransfers;
        totalTransfersForSlippageWeights += route.totalTransfers;
      }
    }

    const successRate = totalTransfers > 0 ? (successfulTransfers / totalTransfers) * 100 : 0;

    const averageSettlementTimeMs = totalSuccessForWeights > 0
      ? Math.round(sumWeightedSettlementTime / totalSuccessForWeights)
      : null;

    const averageFee = totalTransfersForFeeWeights > 0
      ? Number((sumWeightedFee / totalTransfersForFeeWeights).toFixed(10))
      : null;

    const averageSlippagePercent = totalTransfersForSlippageWeights > 0
      ? Number((sumWeightedSlippage / totalTransfersForSlippageWeights).toFixed(4))
      : null;

    return {
      totalVolume: Number(totalVolume.toFixed(10)),
      totalTransfers,
      successfulTransfers,
      failedTransfers,
      successRate: Number(successRate.toFixed(4)),
      averageSettlementTimeMs,
      averageFee,
      averageSlippagePercent,
      routeCount: routes.length,
      generatedAt: new Date(),
    };
  }

  /**
   * Get time-series trends aggregated for Stellar routes
   */
  async getStellarTimeSeries(
    query: StellarTimeSeriesQueryDto,
  ): Promise<TimeSeriesAnalyticsDto> {
    const {
      granularity,
      startDate,
      endDate,
      bridgeName,
      sourceChain,
      destinationChain,
      token,
    } = query;

    let timeBucket: string;
    switch (granularity) {
      case 'hour':
        timeBucket = "DATE_TRUNC('hour', b.created_at)";
        break;
      case 'day':
        timeBucket = "DATE_TRUNC('day', b.created_at)";
        break;
      case 'week':
        timeBucket = "DATE_TRUNC('week', b.created_at)";
        break;
      case 'month':
        timeBucket = "DATE_TRUNC('month', b.created_at)";
        break;
    }

    const params: any[] = [];
    let paramIndex = 1;

    let filterSql = '';
    if (bridgeName) {
      filterSql += ` AND b.bridge_name = $${paramIndex++}`;
      params.push(bridgeName);
    }
    if (sourceChain) {
      filterSql += ` AND b.source_chain = $${paramIndex++}`;
      params.push(sourceChain);
    }
    if (destinationChain) {
      filterSql += ` AND b.destination_chain = $${paramIndex++}`;
      params.push(destinationChain);
    }
    if (token) {
      filterSql += ` AND b.token = $${paramIndex++}`;
      params.push(token);
    }

    filterSql += ` AND b.created_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
    params.push(new Date(startDate).toISOString(), new Date(endDate).toISOString());

    const rawQuery = `
      SELECT 
        ${timeBucket} as timestamp,
        COUNT(*) as transfers,
        COUNT(*) FILTER (WHERE b.status = 'confirmed') as successful_transfers,
        COUNT(*) FILTER (WHERE b.status = 'failed') as failed_transfers,
        AVG(b.duration_ms) FILTER (WHERE b.status = 'confirmed') as avg_settlement_time,
        AVG(b.amount) as avg_amount,
        SUM(b.amount) as total_volume
      FROM bridge_benchmarks b
      WHERE (b.source_chain_type = 'stellar' OR b.destination_chain_type = 'stellar')
        ${filterSql}
      GROUP BY ${timeBucket}
      ORDER BY timestamp ASC
    `;

    const rawData = await this.analyticsRepository.query(rawQuery, params);

    const data: TimeSeriesDataPointDto[] = rawData.map((row: any) => ({
      timestamp: new Date(row.timestamp),
      transfers: parseInt(row.transfers, 10),
      successfulTransfers: parseInt(row.successful_transfers, 10),
      failedTransfers: parseInt(row.failed_transfers, 10),
      averageSettlementTimeMs: row.avg_settlement_time
        ? parseFloat(row.avg_settlement_time)
        : undefined,
      averageFee: undefined,
      averageSlippagePercent: undefined,
      totalVolume: parseFloat(row.total_volume) || 0,
    }));

    return {
      bridgeName: bridgeName || 'all',
      sourceChain: sourceChain || 'all',
      destinationChain: destinationChain || 'all',
      token,
      granularity,
      data,
    };
  }

  /**
   * Helper to map entity to RouteAnalyticsDto
   */
  private mapToRouteAnalyticsDto(entity: BridgeAnalytics): RouteAnalyticsDto {
    return {
      bridgeName: entity.bridgeName,
      sourceChain: entity.sourceChain,
      destinationChain: entity.destinationChain,
      token: entity.token || undefined,
      totalTransfers: entity.totalTransfers,
      successfulTransfers: entity.successfulTransfers,
      failedTransfers: entity.failedTransfers,
      successRate: entity.successRate,
      failureRate: entity.failureRate,
      averageSettlementTimeMs: entity.averageSettlementTimeMs ? Number(entity.averageSettlementTimeMs) : undefined,
      minSettlementTimeMs: entity.minSettlementTimeMs ? Number(entity.minSettlementTimeMs) : undefined,
      maxSettlementTimeMs: entity.maxSettlementTimeMs ? Number(entity.maxSettlementTimeMs) : undefined,
      averageFee: entity.averageFee ? Number(entity.averageFee) : undefined,
      averageSlippagePercent: entity.averageSlippagePercent ? Number(entity.averageSlippagePercent) : undefined,
      totalVolume: Number(entity.totalVolume),
      lastUpdated: entity.lastUpdated,
    };
  }
}
