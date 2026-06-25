import { Module } from '@nestjs/common';
import { IntelligenceHubController } from './intelligence-hub.controller';
import { IntelligenceHubService } from './intelligence-hub.service';

@Module({
  controllers: [IntelligenceHubController],
  providers: [IntelligenceHubService],
  exports: [IntelligenceHubService],
})
export class IntelligenceHubModule {}
