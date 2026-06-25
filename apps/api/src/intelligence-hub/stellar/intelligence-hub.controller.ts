import {
  Controller,
  Get,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { IntelligenceHubService } from './intelligence-hub.service';
import type {
  RouteIntelligence,
  ProviderIntelligence,
  AssetIntelligence,
  IntelligenceSearchResult,
  IntelligenceHubSnapshot,
} from './intelligence-hub.types';

@ApiTags('Intelligence Hub')
@Controller('intelligence-hub/stellar')
export class IntelligenceHubController {
  constructor(private readonly intelligenceHubService: IntelligenceHubService) {}

  @Get('snapshot')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get full intelligence hub snapshot',
    description: 'Returns aggregated route, provider, and asset intelligence for Stellar cross-chain bridging.',
  })
  @ApiResponse({ status: 200, description: 'Intelligence hub snapshot returned successfully' })
  getSnapshot(): IntelligenceHubSnapshot {
    return this.intelligenceHubService.getSnapshot();
  }

  @Get('routes')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aggregate route intelligence',
    description: 'Returns aggregated intelligence for all known Stellar cross-chain routes.',
  })
  @ApiResponse({ status: 200, description: 'Route intelligence returned successfully' })
  getRoutes(): RouteIntelligence[] {
    return this.intelligenceHubService.aggregateRouteIntelligence();
  }

  @Get('providers')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aggregate provider intelligence',
    description: 'Returns aggregated intelligence for all known Stellar bridge providers.',
  })
  @ApiResponse({ status: 200, description: 'Provider intelligence returned successfully' })
  getProviders(): ProviderIntelligence[] {
    return this.intelligenceHubService.aggregateProviderIntelligence();
  }

  @Get('assets')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aggregate asset intelligence',
    description: 'Returns aggregated intelligence for all known Stellar bridge assets.',
  })
  @ApiResponse({ status: 200, description: 'Asset intelligence returned successfully' })
  getAssets(): AssetIntelligence[] {
    return this.intelligenceHubService.aggregateAssetIntelligence();
  }

  @Get('search')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Search across intelligence hub',
    description: 'Search for routes, providers, and assets by keyword.',
  })
  @ApiQuery({ name: 'q', type: 'string', description: 'Search query', required: true })
  @ApiResponse({ status: 200, description: 'Search results returned successfully' })
  search(@Query('q') query: string): IntelligenceSearchResult[] {
    if (!query || query.trim().length === 0) {
      throw new BadRequestException('Query parameter "q" is required');
    }
    return this.intelligenceHubService.search(query.trim());
  }
}
