import {
  Injectable,
  Inject,
  NotFoundException,
  ForbiddenException,
  InternalServerErrorException,
} from "@nestjs/common";
import { eq, and, desc, count, type SQL } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  DRIZZLE,
  marketingCampaigns,
  marketingContents,
  marketingPlatformVariants,
  marketingPublications,
} from "@superbuilder/drizzle";
import { profiles } from "@superbuilder/drizzle";
import { generateSlug } from "../../../shared/utils/slug";
import { buildPaginatedResult } from "../../../shared/utils/offset-pagination";
import { createLogger } from "../../../core/logger";

const logger = createLogger("marketing");
import type { CreateCampaignDto, UpdateCampaignDto, CreateContentDto, UpdateContentDto } from "../dto";
import type {
  CampaignWithStats,
  ContentWithDetails,
  PaginatedResult,
} from "../types";
import type { ContentAdapterService } from "./content-adapter.service";

@Injectable()
export class MarketingService {
  private contentAdapterService: ContentAdapterService | null = null;

  constructor(
    @Inject(DRIZZLE) private readonly db: NodePgDatabase<Record<string, never>>
  ) {}

  /**
   * ContentAdapterService 주입 (순환 의존 방지용 setter)
   */
  setContentAdapterService(service: ContentAdapterService) {
    this.contentAdapterService = service;
  }

  // ==========================================================================
  // Campaign CRUD
  // ==========================================================================

  /**
   * 캠페인 목록 조회 (페이지네이션, contentCount 포함)
   */
  async findCampaigns(
    authorId: string,
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<CampaignWithStats>> {
    const offset = (page - 1) * limit;
    const whereCondition = eq(marketingCampaigns.authorId, authorId);

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(marketingCampaigns)
        .where(whereCondition)
        .orderBy(desc(marketingCampaigns.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(marketingCampaigns)
        .where(whereCondition),
    ]);

    const total = totalResult[0]?.count ?? 0;

    // 각 캠페인의 contentCount를 별도 쿼리로 조회
    const mapped = await Promise.all(
      data.map(async (campaign) => {
        const [contentCountResult] = await this.db
          .select({ count: count() })
          .from(marketingContents)
          .where(eq(marketingContents.campaignId, campaign.id));

        return {
          ...campaign,
          contentCount: Number(contentCountResult?.count ?? 0),
          publishedCount: 0,
        };
      }),
    );

    return buildPaginatedResult(mapped as CampaignWithStats[], total, page, limit);
  }

  /**
   * 캠페인 상세 조회
   */
  async findCampaignById(id: string): Promise<CampaignWithStats> {
    const [result] = await this.db
      .select()
      .from(marketingCampaigns)
      .where(eq(marketingCampaigns.id, id))
      .limit(1);

    if (!result) {
      throw new NotFoundException(`Campaign not found: ${id}`);
    }

    const [contentCountResult] = await this.db
      .select({ count: count() })
      .from(marketingContents)
      .where(eq(marketingContents.campaignId, id));

    return {
      ...result,
      contentCount: Number(contentCountResult?.count ?? 0),
      publishedCount: 0,
    } as CampaignWithStats;
  }

  /**
   * 캠페인 생성
   */
  async createCampaign(
    input: CreateCampaignDto,
    authorId: string,
  ): Promise<CampaignWithStats> {
    const slug = generateSlug(input.name);

    const [campaign] = await this.db
      .insert(marketingCampaigns)
      .values({
        authorId,
        name: input.name,
        slug,
        description: input.description,
        startsAt: input.startsAt ? new Date(input.startsAt) : undefined,
        endsAt: input.endsAt ? new Date(input.endsAt) : undefined,
        tags: input.tags ?? [],
      })
      .returning();

    if (!campaign) throw new InternalServerErrorException("캠페인 생성에 실패했습니다");

    logger.info("Campaign created", {
      "marketing.campaign_id": campaign.id,
      "marketing.campaign_name": campaign.name,
      "user.id": authorId,
    });

    return {
      ...campaign,
      contentCount: 0,
      publishedCount: 0,
    } as CampaignWithStats;
  }

  /**
   * 캠페인 수정 (작성자 확인)
   */
  async updateCampaign(
    id: string,
    input: UpdateCampaignDto,
    authorId: string,
  ): Promise<CampaignWithStats> {
    const existing = await this.findCampaignById(id);
    if (existing.authorId !== authorId) {
      throw new ForbiddenException("캠페인 수정 권한이 없습니다");
    }

    const updateData: Record<string, unknown> = {};
    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.status !== undefined) updateData.status = input.status;
    if (input.startsAt !== undefined) updateData.startsAt = new Date(input.startsAt);
    if (input.endsAt !== undefined) updateData.endsAt = new Date(input.endsAt);
    if (input.tags !== undefined) updateData.tags = input.tags;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(marketingCampaigns)
        .set(updateData)
        .where(eq(marketingCampaigns.id, id));
    }

    logger.info("Campaign updated", {
      "marketing.campaign_id": id,
      "user.id": authorId,
    });

    return this.findCampaignById(id);
  }

  /**
   * 캠페인 삭제 (작성자 확인)
   */
  async deleteCampaign(
    id: string,
    authorId: string,
  ): Promise<{ success: boolean }> {
    const existing = await this.findCampaignById(id);
    if (existing.authorId !== authorId) {
      throw new ForbiddenException("캠페인 삭제 권한이 없습니다");
    }

    await this.db
      .delete(marketingCampaigns)
      .where(eq(marketingCampaigns.id, id));

    logger.info("Campaign deleted", {
      "marketing.campaign_id": id,
      "user.id": authorId,
    });

    return { success: true };
  }

  // ==========================================================================
  // Content CRUD
  // ==========================================================================

  /**
   * 콘텐츠 목록 조회 (필터 + 페이지네이션)
   */
  async findContents(
    filters: { campaignId?: string; authorId?: string },
    page = 1,
    limit = 20,
  ): Promise<PaginatedResult<ContentWithDetails>> {
    const offset = (page - 1) * limit;
    const conditions: SQL[] = [];

    if (filters.campaignId) {
      conditions.push(eq(marketingContents.campaignId, filters.campaignId));
    }
    if (filters.authorId) {
      conditions.push(eq(marketingContents.authorId, filters.authorId));
    }

    const whereCondition =
      conditions.length > 0 ? and(...conditions) : undefined;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(marketingContents)
        .where(whereCondition)
        .orderBy(desc(marketingContents.createdAt))
        .limit(limit)
        .offset(offset),
      this.db
        .select({ count: count() })
        .from(marketingContents)
        .where(whereCondition),
    ]);

    const total = totalResult[0]?.count ?? 0;

    // 각 콘텐츠에 대해 variants, publications, author 정보를 별도 조회
    const mapped = await Promise.all(
      data.map(async (item) => {
        const [variants, publications, authorResult] = await Promise.all([
          this.db
            .select()
            .from(marketingPlatformVariants)
            .where(eq(marketingPlatformVariants.contentId, item.id)),
          this.db
            .select()
            .from(marketingPublications)
            .where(eq(marketingPublications.contentId, item.id)),
          this.db
            .select({ name: profiles.name, avatar: profiles.avatar })
            .from(profiles)
            .where(eq(profiles.id, item.authorId))
            .limit(1),
        ]);

        const author = authorResult[0];

        return {
          ...item,
          authorName: author?.name ?? null,
          authorAvatar: author?.avatar ?? null,
          variants,
          publications,
        };
      }),
    );

    return buildPaginatedResult(mapped as ContentWithDetails[], total, page, limit);
  }

  /**
   * 콘텐츠 상세 조회 (variants, publications 포함)
   */
  async findContentById(id: string): Promise<ContentWithDetails> {
    const [result] = await this.db
      .select()
      .from(marketingContents)
      .where(eq(marketingContents.id, id))
      .limit(1);

    if (!result) {
      throw new NotFoundException(`Content not found: ${id}`);
    }

    const [variants, publications, authorResult] = await Promise.all([
      this.db
        .select()
        .from(marketingPlatformVariants)
        .where(eq(marketingPlatformVariants.contentId, id)),
      this.db
        .select()
        .from(marketingPublications)
        .where(eq(marketingPublications.contentId, id)),
      this.db
        .select({ name: profiles.name, avatar: profiles.avatar })
        .from(profiles)
        .where(eq(profiles.id, result.authorId))
        .limit(1),
    ]);

    const author = authorResult[0];

    return {
      ...result,
      authorName: author?.name ?? null,
      authorAvatar: author?.avatar ?? null,
      variants,
      publications,
    } as ContentWithDetails;
  }

  /**
   * 콘텐츠 생성
   */
  async createContent(
    input: CreateContentDto,
    authorId: string,
  ): Promise<ContentWithDetails> {
    const [content] = await this.db
      .insert(marketingContents)
      .values({
        authorId,
        campaignId: input.campaignId,
        title: input.title,
        body: input.body,
        images: input.images ?? [],
        linkUrl: input.linkUrl,
        tags: input.tags ?? [],
        sourceType: "editor",
      })
      .returning();

    if (!content) throw new InternalServerErrorException("콘텐츠 생성에 실패했습니다");

    logger.info("Content created", {
      "marketing.content_id": content.id,
      "marketing.content_title": content.title,
      "user.id": authorId,
    });

    return this.findContentById(content.id);
  }

  /**
   * 소스 콘텐츠로부터 마케팅 콘텐츠 초안 생성
   */
  async createContentFromSource(
    sourceType: string,
    sourceId: string,
    authorId: string,
    campaignId?: string,
  ): Promise<ContentWithDetails> {
    if (!this.contentAdapterService) {
      throw new NotFoundException("ContentAdapterService가 설정되지 않았습니다");
    }

    const draft = await this.contentAdapterService.createDraft(
      sourceType,
      sourceId,
    );

    const [content] = await this.db
      .insert(marketingContents)
      .values({
        authorId,
        campaignId,
        sourceType: sourceType as "editor" | "board_post" | "community_post" | "content_studio",
        sourceId,
        title: draft.title,
        body: draft.body,
        images: draft.images,
        linkUrl: draft.linkUrl,
        tags: draft.tags,
      })
      .returning();

    if (!content) throw new InternalServerErrorException("콘텐츠 생성에 실패했습니다");

    logger.info("Content created from source", {
      "marketing.content_id": content.id,
      "marketing.source_type": sourceType,
      "marketing.source_id": sourceId,
      "user.id": authorId,
    });

    return this.findContentById(content.id);
  }

  /**
   * 콘텐츠 수정 (작성자 확인)
   */
  async updateContent(
    id: string,
    input: UpdateContentDto,
    authorId: string,
  ): Promise<ContentWithDetails> {
    const existing = await this.findContentById(id);
    if (existing.authorId !== authorId) {
      throw new ForbiddenException("콘텐츠 수정 권한이 없습니다");
    }

    const updateData: Record<string, unknown> = {};
    if (input.title !== undefined) updateData.title = input.title;
    if (input.body !== undefined) updateData.body = input.body;
    if (input.images !== undefined) updateData.images = input.images;
    if (input.linkUrl !== undefined) updateData.linkUrl = input.linkUrl;
    if (input.tags !== undefined) updateData.tags = input.tags;
    if (input.campaignId !== undefined) updateData.campaignId = input.campaignId;

    if (Object.keys(updateData).length > 0) {
      await this.db
        .update(marketingContents)
        .set(updateData)
        .where(eq(marketingContents.id, id));
    }

    logger.info("Content updated", {
      "marketing.content_id": id,
      "user.id": authorId,
    });

    return this.findContentById(id);
  }

  /**
   * 콘텐츠 삭제 (작성자 확인)
   */
  async deleteContent(
    id: string,
    authorId: string,
  ): Promise<{ success: boolean }> {
    const existing = await this.findContentById(id);
    if (existing.authorId !== authorId) {
      throw new ForbiddenException("콘텐츠 삭제 권한이 없습니다");
    }

    await this.db
      .delete(marketingContents)
      .where(eq(marketingContents.id, id));

    logger.info("Content deleted", {
      "marketing.content_id": id,
      "user.id": authorId,
    });

    return { success: true };
  }

}
