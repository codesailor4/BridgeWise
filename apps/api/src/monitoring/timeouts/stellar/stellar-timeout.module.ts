import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { StellarTimeoutMonitor } from './stellar-timeout.monitor';
import { StellarTimeoutScheduler } from './stellar-timeout.scheduler';
import { StellarTimeoutController } from './stellar-timeout.controller';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    EventEmitterModule.forRoot(),
  ],
  controllers: [StellarTimeoutController],
  providers: [StellarTimeoutMonitor, StellarTimeoutScheduler],
  exports: [StellarTimeoutMonitor],
})
export class StellarTimeoutModule {}
