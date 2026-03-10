import { Module, OnModuleInit } from "@nestjs/common";
import { DrizzleModule } from "@superbuilder/drizzle";
import {
  MarketingService,
  PublishOrchestratorService,
  SnsAccountService,
  SnsPublisherService,
  ContentAdapterService,
  UtmService,
  SchedulerService,
} from "./service";
import { MarketingController, MarketingAdminController } from "./controller";
import { injectMarketingServices } from "./trpc";

/**
 * Marketing Feature Module
 *
 * SNS 마케팅 콘텐츠 관리 및 멀티 플랫폼 발행 시스템.
 * 캠페인, 콘텐츠, SNS 계정 연동, 발행, 스케줄링 기능 제공.
 */
@Module({
  imports: [DrizzleModule],
  controllers: [MarketingController, MarketingAdminController],
  providers: [
    MarketingService,
    PublishOrchestratorService,
    SnsAccountService,
    SnsPublisherService,
    ContentAdapterService,
    UtmService,
    SchedulerService,
  ],
  exports: [
    MarketingService,
    PublishOrchestratorService,
    SnsAccountService,
    SnsPublisherService,
    ContentAdapterService,
  ],
})
export class MarketingModule implements OnModuleInit {
  constructor(
    private readonly marketingService: MarketingService,
    private readonly publishOrchestratorService: PublishOrchestratorService,
    private readonly snsAccountService: SnsAccountService,
    private readonly snsPublisherService: SnsPublisherService,
    private readonly contentAdapterService: ContentAdapterService,
    private readonly utmService: UtmService,
    private readonly schedulerService: SchedulerService,
  ) {}

  /**
   * tRPC 라우터에 서비스 주입 + 내부 의존성 연결
   */
  onModuleInit() {
    // ContentAdapterService를 MarketingService에 주입 (순환 의존 방지)
    this.marketingService.setContentAdapterService(this.contentAdapterService);

    // tRPC 라우터에 서비스 컨테이너 주입
    injectMarketingServices({
      marketingService: this.marketingService,
      publishOrchestratorService: this.publishOrchestratorService,
      snsAccountService: this.snsAccountService,
      snsPublisherService: this.snsPublisherService,
      contentAdapterService: this.contentAdapterService,
      utmService: this.utmService,
      schedulerService: this.schedulerService,
    });
  }
}
