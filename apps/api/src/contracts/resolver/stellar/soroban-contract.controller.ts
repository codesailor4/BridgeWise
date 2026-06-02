/**
 * Soroban Contract Resolver Controller
 *
 * REST endpoints for resolving and validating Soroban contract addresses.
 */

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { SorobanContractResolver } from './soroban-contract.resolver';
import {
  SorobanNetwork,
  ResolvedContract,
  ContractValidationResult,
  BatchResolveResult,
} from './soroban-contract.types';

class ResolveQueryDto {
  network?: SorobanNetwork;
  verifyOnChain?: string; // query params come in as strings
  bypassCache?: string;
}

class BatchResolveDto {
  addresses: string[];
  network?: SorobanNetwork;
  verifyOnChain?: boolean;
}

@Controller('contracts/resolver/stellar')
export class SorobanContractController {
  constructor(private readonly resolver: SorobanContractResolver) {}

  /**
   * Validate a contract address format (no on-chain lookup).
   * GET /contracts/resolver/stellar/validate/:address
   */
  @Get('validate/:address')
  validate(@Param('address') address: string): ContractValidationResult {
    if (!address) throw new BadRequestException('address is required');
    return this.resolver.validate(address);
  }

  /**
   * Resolve a single contract address.
   * GET /contracts/resolver/stellar/:address
   */
  @Get(':address')
  async resolve(
    @Param('address') address: string,
    @Query() query: ResolveQueryDto,
  ): Promise<ResolvedContract> {
    if (!address) throw new BadRequestException('address is required');

    return this.resolver.resolve(address, {
      network: query.network,
      verifyOnChain: query.verifyOnChain !== 'false',
      bypassCache: query.bypassCache === 'true',
    });
  }

  /**
   * Resolve multiple contract addresses in one request.
   * POST /contracts/resolver/stellar/batch
   */
  @Post('batch')
  @HttpCode(HttpStatus.OK)
  async resolveBatch(@Body() dto: BatchResolveDto): Promise<BatchResolveResult> {
    if (!Array.isArray(dto.addresses) || dto.addresses.length === 0) {
      throw new BadRequestException('addresses must be a non-empty array');
    }
    if (dto.addresses.length > 50) {
      throw new BadRequestException('Maximum 50 addresses per batch request');
    }

    return this.resolver.resolveBatch({
      addresses: dto.addresses,
      options: {
        network: dto.network,
        verifyOnChain: dto.verifyOnChain,
      },
    });
  }
}
