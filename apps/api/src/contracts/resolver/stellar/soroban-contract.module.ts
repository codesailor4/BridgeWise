import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { SorobanContractResolver } from './soroban-contract.resolver';
import { SorobanContractController } from './soroban-contract.controller';

@Module({
  imports: [
    HttpModule.register({
      timeout: 10000,
      maxRedirects: 3,
    }),
  ],
  controllers: [SorobanContractController],
  providers: [SorobanContractResolver],
  exports: [SorobanContractResolver],
})
export class SorobanContractModule {}
