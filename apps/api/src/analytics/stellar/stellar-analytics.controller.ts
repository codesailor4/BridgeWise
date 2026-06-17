import { Controller, Get, Query, HttpStatus, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { StellarAnalyticsService } from './stellar-analytics.service';
import {
  BridgeAnalyticsQueryDto,
  BridgeAnalyticsResponseDto,
  TimeSeriesAnalyticsDto,
} from '../dto/bridge-analytics.dto';
import {
  StellarAggregatedMetricsDto,
  StellarTimeSeriesQueryDto,
} from './dto/stellar-analytics.dto';

/**
 * Stellar Analytics Controller
 *
 * REST API endpoints for Stellar/Soroban bridge analytics data.
 * Provides metrics on Stellar/Soroban bridge usage, trends, and network-wide totals.
 */
@ApiTags('Stellar Bridge Analytics')
@Controller('api/v1/bridge-analytics/stellar')
export class StellarAnalyticsController {
  constructor(
    private readonly stellarAnalyticsService: StellarAnalyticsService,
  ) {}

  /**
   * Get route-by-route analytics for Stellar bridges
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get route-specific Stellar bridge analytics',
    description:
      'Returns paginated, route-by-route analytics for Stellar bridges with optional filtering.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stellar route analytics retrieved successfully',
    type: BridgeAnalyticsResponseDto,
  })
  async getStellarAnalytics(
    @Query() query: BridgeAnalyticsQueryDto,
  ): Promise<BridgeAnalyticsResponseDto> {
    return this.stellarAnalyticsService.getStellarAnalytics(query);
  }

  /**
   * Get aggregated metrics across all matching Stellar bridge routes
   */
  @Get('metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get global aggregated metrics for Stellar bridges',
    description:
      'Returns aggregated statistics (volume, transfers, success rate, averages) across matching Stellar routes.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stellar aggregated metrics retrieved successfully',
    type: StellarAggregatedMetricsDto,
  })
  async getStellarAggregatedMetrics(
    @Query() query: BridgeAnalyticsQueryDto,
  ): Promise<StellarAggregatedMetricsDto> {
    return this.stellarAnalyticsService.getStellarAggregatedMetrics(query);
  }

  /**
   * Get time-series trends for Stellar routes
   */
  @Get('trends')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get time-series trends for Stellar routes',
    description:
      'Returns aggregated time-series metrics over time (volume, transfers, etc.) with specified granularity.',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Stellar time-series trends retrieved successfully',
    type: TimeSeriesAnalyticsDto,
  })
  async getStellarTimeSeries(
    @Query() query: StellarTimeSeriesQueryDto,
  ): Promise<TimeSeriesAnalyticsDto> {
    return this.stellarAnalyticsService.getStellarTimeSeries(query);
  }
}
