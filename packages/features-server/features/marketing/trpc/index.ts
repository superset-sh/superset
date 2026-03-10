/**
 * Marketing tRPC Routers
 *
 * 캠페인, 콘텐츠, SNS 계정, 발행, 관리자용 5개 서브 라우터 통합
 */
import { createServiceContainer, router } from "../../../core/trpc";
import type {
  ContentAdapterService,
  MarketingService,
  PublishOrchestratorService,
  SchedulerService,
  SnsAccountService,
  SnsPublisherService,
  UtmService,
} from "../service";
import { accountRouter } from "./account.route";
import { adminRouter } from "./admin.route";
import { campaignRouter } from "./campaign.route";
import { contentRouter } from "./content.route";
import { publishRouter } from "./publish.route";

// ============================================================================
// Shared Service Container
// ============================================================================

const services = createServiceContainer<{
  marketingService: MarketingService;
  publishOrchestratorService: PublishOrchestratorService;
  snsAccountService: SnsAccountService;
  snsPublisherService: SnsPublisherService;
  contentAdapterService: ContentAdapterService;
  utmService: UtmService;
  schedulerService: SchedulerService;
}>();

export const getMarketingServices = services.get;
export const injectMarketingServices = services.inject;

// 통합 라우터
export const marketingMainRouter = router({
  campaigns: campaignRouter,
  contents: contentRouter,
  accounts: accountRouter,
  publish: publishRouter,
  admin: adminRouter,
});

export type MarketingMainRouter = typeof marketingMainRouter;
