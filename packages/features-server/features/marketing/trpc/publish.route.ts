/**
 * Marketing Publish tRPC Router
 *
 * 즉시 발행, 예약 발행, 플랫폼 제약사항 조회 프로시저
 */
import { authProcedure, getAuthUserId, publicProcedure, router } from "../../../core/trpc";
import { marketingPlatformVariants, marketingPublications } from "@superbuilder/drizzle";
import { eq } from "drizzle-orm";
import { publishNowSchema, schedulePublishSchema } from "../dto";
import { getMarketingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const publishRouter = router({
  /**
   * 즉시 발행
   * 각 플랫폼별 publication 레코드를 생성하고 발행을 시도합니다.
   */
  now: authProcedure.input(publishNowSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { marketingService, snsAccountService, snsPublisherService, utmService } =
      getMarketingServices();

    // 콘텐츠 존재 확인
    const content = await marketingService.findContentById(input.contentId);

    // 캠페인 slug 조회 (UTM 용)
    let campaignSlug: string | undefined;
    if (content.campaignId) {
      try {
        const campaign = await marketingService.findCampaignById(content.campaignId);
        campaignSlug = campaign.slug;
      } catch {
        // 캠페인이 없어도 발행은 진행
      }
    }

    const results: Array<{
      platform: string;
      success: boolean;
      publicationId?: string;
      error?: string;
    }> = [];

    for (const platform of input.platforms) {
      const accountId = input.accountIds[platform];
      if (!accountId) {
        results.push({
          platform,
          success: false,
          error: `계정 ID가 지정되지 않았습니다: ${platform}`,
        });
        continue;
      }

      try {
        // 계정 유효성 확인
        const account = await snsAccountService.getValidAccount(accountId, userId);

        // 해당 플랫폼 variant 조회
        const variants = await ctx.db
          .select()
          .from(marketingPlatformVariants)
          .where(eq(marketingPlatformVariants.contentId, input.contentId))
          .limit(50);

        const variant = variants.find((v) => v.platform === platform);

        if (!variant) {
          results.push({
            platform,
            success: false,
            error: `플랫폼 변형 콘텐츠가 없습니다: ${platform}`,
          });
          continue;
        }

        // UTM 파라미터 생성
        const utm = utmService.generateUtm(platform, campaignSlug, input.contentId);

        // Publication 레코드 생성
        const [publication] = await ctx.db
          .insert(marketingPublications)
          .values({
            contentId: input.contentId,
            variantId: variant.id,
            snsAccountId: accountId,
            platform,
            status: "publishing",
            utmSource: utm.utm_source,
            utmMedium: utm.utm_medium,
            utmCampaign: utm.utm_campaign,
            utmContent: utm.utm_content,
          })
          .returning();

        if (!publication) {
          results.push({ platform, success: false, error: "발행 레코드 생성 실패" });
          continue;
        }

        // 발행 실행
        const publishResult = await snsPublisherService.publish(platform, variant, account);

        if (publishResult.success) {
          await ctx.db
            .update(marketingPublications)
            .set({
              status: "published",
              publishedAt: new Date(),
              platformPostId: publishResult.platformPostId,
              platformPostUrl: publishResult.platformPostUrl,
            })
            .where(eq(marketingPublications.id, publication.id));

          results.push({
            platform,
            success: true,
            publicationId: publication.id,
          });
        } else {
          await ctx.db
            .update(marketingPublications)
            .set({
              status: "failed",
              errorMessage: publishResult.errorMessage,
            })
            .where(eq(marketingPublications.id, publication.id));

          results.push({
            platform,
            success: false,
            publicationId: publication.id,
            error: publishResult.errorMessage,
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
        results.push({ platform, success: false, error: errorMessage });
      }
    }

    return { results };
  }),

  /**
   * 예약 발행
   * publication 레코드를 scheduled 상태로 생성합니다.
   * SchedulerService가 예약 시간에 발행을 처리합니다.
   */
  schedule: authProcedure.input(schedulePublishSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { marketingService, snsAccountService, utmService } = getMarketingServices();

    // 콘텐츠 존재 확인
    const content = await marketingService.findContentById(input.contentId);

    // 캠페인 slug 조회 (UTM 용)
    let campaignSlug: string | undefined;
    if (content.campaignId) {
      try {
        const campaign = await marketingService.findCampaignById(content.campaignId);
        campaignSlug = campaign.slug;
      } catch {
        // 캠페인이 없어도 예약은 진행
      }
    }

    const scheduledAt = new Date(input.scheduledAt);
    const results: Array<{
      platform: string;
      publicationId: string;
    }> = [];

    for (const platform of input.platforms) {
      const accountId = input.accountIds[platform];
      if (!accountId) continue;

      // 계정 유효성 확인
      await snsAccountService.getValidAccount(accountId, userId);

      // 해당 플랫폼 variant 조회
      const variants = await ctx.db
        .select()
        .from(marketingPlatformVariants)
        .where(eq(marketingPlatformVariants.contentId, input.contentId))
        .limit(50);

      const variant = variants.find((v) => v.platform === platform);

      // UTM 파라미터 생성
      const utm = utmService.generateUtm(platform, campaignSlug, input.contentId);

      // Publication 레코드를 scheduled 상태로 생성
      const [publication] = await ctx.db
        .insert(marketingPublications)
        .values({
          contentId: input.contentId,
          variantId: variant?.id,
          snsAccountId: accountId,
          platform,
          status: "scheduled",
          scheduledAt,
          utmSource: utm.utm_source,
          utmMedium: utm.utm_medium,
          utmCampaign: utm.utm_campaign,
          utmContent: utm.utm_content,
        })
        .returning();

      if (publication) {
        results.push({ platform, publicationId: publication.id });
      }
    }

    return { scheduledAt: scheduledAt.toISOString(), results };
  }),

  /**
   * 플랫폼 제약사항 조회 (공개)
   */
  constraints: publicProcedure.query(async () => {
    const { snsPublisherService } = getMarketingServices();
    return snsPublisherService.getAllConstraints();
  }),
});

export type PublishRouterType = typeof publishRouter;
