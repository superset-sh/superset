import { Module, OnModuleInit } from '@nestjs/common';
import { AnalyticsController } from './controller/analytics.controller';
import { AnalyticsService } from './service/analytics.service';
import { injectAnalyticsService } from './analytics.router';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule implements OnModuleInit {
  constructor(private readonly analyticsService: AnalyticsService) {}

  onModuleInit() {
    // tRPC 서비스 주입
    injectAnalyticsService(this.analyticsService);
  }
}
