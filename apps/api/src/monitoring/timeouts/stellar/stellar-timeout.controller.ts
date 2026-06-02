/**
 * Stellar Timeout Controller
 *
 * REST endpoints for visibility into transfer timeout state.
 * Gives users and operators direct access to timeout conditions.
 */

import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { StellarTimeoutMonitor } from './stellar-timeout.monitor';
import type {
  TrackedTransfer,
  TransferStatusCheck,
  TimeoutScanSummary,
  TimeoutThresholds,
} from './stellar-timeout.types';

class RegisterTransferDto {
  transferId: string;
  sourceAccount: string;
  destinationAccount: string;
  asset: string;
  amount: string;
  ledgerAtRegistration?: number;
  metadata?: Record<string, unknown>;
}

class UpdateThresholdsDto {
  warningMs?: number;
  criticalMs?: number;
}

@Controller('monitoring/timeouts/stellar')
export class StellarTimeoutController {
  constructor(private readonly monitor: StellarTimeoutMonitor) {}

  /**
   * Register a new transfer for timeout tracking.
   * POST /monitoring/timeouts/stellar/transfers
   */
  @Post('transfers')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterTransferDto): TrackedTransfer {
    if (!dto.transferId || !dto.sourceAccount || !dto.destinationAccount || !dto.asset || !dto.amount) {
      throw new BadRequestException('transferId, sourceAccount, destinationAccount, asset, and amount are required');
    }
    return this.monitor.register(dto);
  }

  /**
   * Get all currently active (non-resolved) transfers.
   * GET /monitoring/timeouts/stellar/transfers
   */
  @Get('transfers')
  getActive(): TrackedTransfer[] {
    return this.monitor.getActiveTransfers();
  }

  /**
   * Check timeout status of a specific transfer.
   * GET /monitoring/timeouts/stellar/transfers/:transferId
   */
  @Get('transfers/:transferId')
  checkTransfer(@Param('transferId') transferId: string): TransferStatusCheck {
    const result = this.monitor.checkTransfer(transferId);
    if (!result) {
      throw new NotFoundException(`Transfer ${transferId} is not actively tracked`);
    }
    return result;
  }

  /**
   * Mark a transfer as completed.
   * PATCH /monitoring/timeouts/stellar/transfers/:transferId/complete
   */
  @Patch('transfers/:transferId/complete')
  markCompleted(@Param('transferId') transferId: string): TrackedTransfer {
    const result = this.monitor.markCompleted(transferId);
    if (!result) {
      throw new NotFoundException(`Transfer ${transferId} is not actively tracked`);
    }
    return result;
  }

  /**
   * Mark a transfer as failed.
   * PATCH /monitoring/timeouts/stellar/transfers/:transferId/fail
   */
  @Patch('transfers/:transferId/fail')
  markFailed(
    @Param('transferId') transferId: string,
    @Body() body: { reason?: string },
  ): TrackedTransfer {
    const result = this.monitor.markFailed(transferId, body?.reason);
    if (!result) {
      throw new NotFoundException(`Transfer ${transferId} is not actively tracked`);
    }
    return result;
  }

  /**
   * Trigger an on-demand timeout scan.
   * POST /monitoring/timeouts/stellar/scan
   */
  @Post('scan')
  @HttpCode(HttpStatus.OK)
  scan(): TimeoutScanSummary {
    return this.monitor.scan();
  }

  /**
   * Get resolved transfer history.
   * GET /monitoring/timeouts/stellar/history
   */
  @Get('history')
  getHistory(): TrackedTransfer[] {
    return this.monitor.getHistory();
  }

  /**
   * Get current timeout thresholds.
   * GET /monitoring/timeouts/stellar/thresholds
   */
  @Get('thresholds')
  getThresholds(): TimeoutThresholds {
    return this.monitor.getThresholds();
  }

  /**
   * Update timeout thresholds.
   * PATCH /monitoring/timeouts/stellar/thresholds
   */
  @Patch('thresholds')
  updateThresholds(@Body() dto: UpdateThresholdsDto): TimeoutThresholds {
    if (dto.warningMs !== undefined && dto.warningMs <= 0) {
      throw new BadRequestException('warningMs must be a positive number');
    }
    if (dto.criticalMs !== undefined && dto.criticalMs <= 0) {
      throw new BadRequestException('criticalMs must be a positive number');
    }
    if (
      dto.warningMs !== undefined &&
      dto.criticalMs !== undefined &&
      dto.warningMs >= dto.criticalMs
    ) {
      throw new BadRequestException('warningMs must be less than criticalMs');
    }
    this.monitor.setThresholds(dto);
    return this.monitor.getThresholds();
  }
}
