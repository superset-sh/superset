/**
 * Marketing Admin REST Controller
 *
 * 관리자 전용 마케팅 관리 엔드포인트 (전체 캠페인/콘텐츠 조회, 통계)
 */
import {
  Controller,
  Get,
  Query,
  UseGuards,
  DefaultValuePipe,
  ParseIntPipe,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from "@nestjs/swagger";
import { JwtAuthGuard, NestAdminGuard } from "../../../core/nestjs/auth";
import { count, desc } from "drizzle-orm";
import { Inject } from "@nestjs/common";
import { DRIZZLE } from "@superbuilder/drizzle";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  marketingCampaigns,
  marketingContents,
  marketingPublications,
  marketingSnsAccounts,
} from "@superbuilder/drizzle";
import { buildPaginatedResult } from "../../../shared/utils/offset-pagination";

@ApiTags("Marketing Admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, NestAdminGuard)
@Controller("admin/marketing")
export class MarketingAdminController {
  constructor(
    @Inject(DRIZZLE)
    private readonly db: NodePgDatabase<Record<string, never>>,
  ) {}

  @Get("campaigns")
  @ApiOperation({ summary: "전체 캠페인 목록 (관리자용 — 모든 유저)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "전체 캠페인 목록 반환" })
  async allCampaigns(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(marketingCampaigns)
        .orderBy(desc(marketingCampaigns.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(marketingCampaigns),
    ]);

    const total = totalResult[0]?.count ?? 0;
    return buildPaginatedResult(data, total, page, limit);
  }

  @Get("contents")
  @ApiOperation({ summary: "전체 콘텐츠 목록 (관리자용 — 모든 유저)" })
  @ApiQuery({ name: "page", required: false, type: Number })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiResponse({ status: 200, description: "전체 콘텐츠 목록 반환" })
  async allContents(
    @Query("page", new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query("limit", new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    const offset = (page - 1) * limit;

    const [data, totalResult] = await Promise.all([
      this.db
        .select()
        .from(marketingContents)
        .orderBy(desc(marketingContents.createdAt))
        .limit(limit)
        .offset(offset),
      this.db.select({ count: count() }).from(marketingContents),
    ]);

    const total = totalResult[0]?.count ?? 0;
    return buildPaginatedResult(data, total, page, limit);
  }

  @Get("stats")
  @ApiOperation({ summary: "마케팅 전체 통계" })
  @ApiResponse({ status: 200, description: "통계 데이터 반환" })
  async stats() {
    const [campaignCount, contentCount, publicationCount, accountCount] =
      await Promise.all([
        this.db.select({ count: count() }).from(marketingCampaigns),
        this.db.select({ count: count() }).from(marketingContents),
        this.db.select({ count: count() }).from(marketingPublications),
        this.db.select({ count: count() }).from(marketingSnsAccounts),
      ]);

    const publicationsByStatus = await this.db
      .select({
        status: marketingPublications.status,
        count: count(),
      })
      .from(marketingPublications)
      .groupBy(marketingPublications.status);

    return {
      totalCampaigns: campaignCount[0]?.count ?? 0,
      totalContents: contentCount[0]?.count ?? 0,
      totalPublications: publicationCount[0]?.count ?? 0,
      totalAccounts: accountCount[0]?.count ?? 0,
      publicationsByStatus: publicationsByStatus.reduce(
        (acc, item) => {
          acc[item.status] = item.count;
          return acc;
        },
        {} as Record<string, number>,
      ),
    };
  }
}
