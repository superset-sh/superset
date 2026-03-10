import { Injectable, Inject, ForbiddenException } from "@nestjs/common";
import { createLogger } from "../../../core/logger";

const logger = createLogger("marketing");
import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  DRIZZLE,
  marketingPlatformVariants,
  marketingPublications,
  type SnsPlatform,
} from "@superbuilder/drizzle";
import type { PublishNowDto, SchedulePublishDto } from "../dto";
import { MarketingService } from "./marketing.service";
import { SnsAccountService } from "./sns-account.service";
import { SnsPublisherService } from "./sns-publisher.service";
import { UtmService } from "./utm.service";

export interface PublishNowResultItem {
  platform: SnsPlatform;
  success: boolean;
  publicationId?: string;
  error?: string;
}

export interface ScheduleResultItem {
  platform: SnsPlatform;
  publicationId: string;
}

@Injectable()
export class PublishOrchestratorService {
  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>,
    private readonly marketingService: MarketingService,
    private readonly snsAccountService: SnsAccountService,
    private readonly snsPublisherService: SnsPublisherService,
    private readonly utmService: UtmService,
  ) {}

  async publishNow(input: PublishNowDto, userId: string): Promise<{ results: PublishNowResultItem[] }> {
    const content = await this.marketingService.findContentById(input.contentId);
    if (content.authorId !== userId) {
      throw new ForbiddenException("발행 권한이 없습니다");
    }

    let campaignSlug: string | undefined;
    if (content.campaignId) {
      try {
        const campaign = await this.marketingService.findCampaignById(content.campaignId);
        campaignSlug = campaign.slug;
      } catch {
        campaignSlug = undefined;
      }
    }

    const variants = await this.db
      .select()
      .from(marketingPlatformVariants)
      .where(eq(marketingPlatformVariants.contentId, input.contentId))
      .limit(50);

    const results: PublishNowResultItem[] = [];

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
        const account = await this.snsAccountService.getValidAccount(accountId, userId);
        const variant = variants.find((v) => v.platform === platform);

        if (!variant) {
          results.push({
            platform,
            success: false,
            error: `플랫폼 변형 콘텐츠가 없습니다: ${platform}`,
          });
          continue;
        }

        const utm = this.utmService.generateUtm(platform, campaignSlug, input.contentId);

        const [publication] = await this.db
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

        const publishResult = await this.snsPublisherService.publish(platform, variant, account);

        if (publishResult.success) {
          await this.db
            .update(marketingPublications)
            .set({
              status: "published",
              publishedAt: new Date(),
              platformPostId: publishResult.platformPostId,
              platformPostUrl: publishResult.platformPostUrl,
            })
            .where(eq(marketingPublications.id, publication.id));

          results.push({ platform, success: true, publicationId: publication.id });
          continue;
        }

        await this.db
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
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "알 수 없는 오류";
        results.push({ platform, success: false, error: errorMessage });
      }
    }

    logger.info("Content published", {
      "marketing.content_id": input.contentId,
      "marketing.platforms": input.platforms.join(","),
      "marketing.success_count": results.filter((r) => r.success).length,
      "marketing.fail_count": results.filter((r) => !r.success).length,
      "user.id": userId,
    });

    return { results };
  }

  async schedulePublish(
    input: SchedulePublishDto,
    userId: string,
  ): Promise<{ scheduledAt: string; results: ScheduleResultItem[] }> {
    const content = await this.marketingService.findContentById(input.contentId);
    if (content.authorId !== userId) {
      throw new ForbiddenException("예약 발행 권한이 없습니다");
    }

    let campaignSlug: string | undefined;
    if (content.campaignId) {
      try {
        const campaign = await this.marketingService.findCampaignById(content.campaignId);
        campaignSlug = campaign.slug;
      } catch {
        campaignSlug = undefined;
      }
    }

    const variants = await this.db
      .select()
      .from(marketingPlatformVariants)
      .where(eq(marketingPlatformVariants.contentId, input.contentId))
      .limit(50);

    const scheduledAt = new Date(input.scheduledAt);
    const results: ScheduleResultItem[] = [];

    for (const platform of input.platforms) {
      const accountId = input.accountIds[platform];
      if (!accountId) {
        continue;
      }

      await this.snsAccountService.getValidAccount(accountId, userId);
      const variant = variants.find((v) => v.platform === platform);
      const utm = this.utmService.generateUtm(platform, campaignSlug, input.contentId);

      const [publication] = await this.db
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

    logger.info("Content scheduled", {
      "marketing.content_id": input.contentId,
      "marketing.scheduled_at": scheduledAt.toISOString(),
      "marketing.platforms": input.platforms.join(","),
      "user.id": userId,
    });

    return { scheduledAt: scheduledAt.toISOString(), results };
  }
}
