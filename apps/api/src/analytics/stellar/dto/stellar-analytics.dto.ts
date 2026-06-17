import { IsOptional, IsString, IsDateString, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Query parameters for Stellar time-series analytics
 */
export class StellarTimeSeriesQueryDto {
  @ApiProperty({
    description: 'Time granularity for data points',
    enum: ['hour', 'day', 'week', 'month'],
  })
  @IsEnum(['hour', 'day', 'week', 'month'] as const)
  granularity: 'hour' | 'day' | 'week' | 'month';

  @ApiProperty({ description: 'Start date (ISO 8601)' })
  @IsDateString()
  startDate: string;

  @ApiProperty({ description: 'End date (ISO 8601)' })
  @IsDateString()
  endDate: string;

  @ApiPropertyOptional({ description: 'Filter by bridge name' })
  @IsOptional()
  @IsString()
  bridgeName?: string;

  @ApiPropertyOptional({ description: 'Filter by source chain' })
  @IsOptional()
  @IsString()
  sourceChain?: string;

  @ApiPropertyOptional({ description: 'Filter by destination chain' })
  @IsOptional()
  @IsString()
  destinationChain?: string;

  @ApiPropertyOptional({ description: 'Filter by token symbol' })
  @IsOptional()
  @IsString()
  token?: string;
}

/**
 * Aggregated metrics response DTO for Stellar bridges
 */
export class StellarAggregatedMetricsDto {
  @ApiProperty({ description: 'Total volume transferred across all matching Stellar routes' })
  totalVolume: number;

  @ApiProperty({ description: 'Total number of transfers' })
  totalTransfers: number;

  @ApiProperty({ description: 'Number of successful transfers' })
  successfulTransfers: number;

  @ApiProperty({ description: 'Number of failed transfers' })
  failedTransfers: number;

  @ApiProperty({ description: 'Overall success rate percentage' })
  successRate: number;

  @ApiProperty({
    description: 'Weighted average settlement time in milliseconds',
    nullable: true,
  })
  averageSettlementTimeMs: number | null;

  @ApiProperty({
    description: 'Weighted average fee amount',
    nullable: true,
  })
  averageFee: number | null;

  @ApiProperty({
    description: 'Weighted average slippage percentage',
    nullable: true,
  })
  averageSlippagePercent: number | null;

  @ApiProperty({ description: 'Total count of active Stellar routes' })
  routeCount: number;

  @ApiProperty({ description: 'Generation timestamp' })
  generatedAt: Date;
}
