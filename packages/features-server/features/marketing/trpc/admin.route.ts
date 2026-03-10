/**
 * Marketing Admin tRPC Router
 *
 * 관리자 전용 프로시저 (전체 캠페인/콘텐츠 조회, 통계)
 */
import { z } from "zod";
import { count, desc } from "drizzle-orm";
import { buildPaginatedResult } from "../../../shared/utils/offset-pagination";
import { adminProcedure } from "../../../core/trpc";
import { router } from "../../../core/trpc";
import {
  marketingCampaigns,
  marketingContents,
  marketingPublications,
  marketingSnsAccounts,
} from "@superbuilder/drizzle";
// ============================================================================
// Router
// ============================================================================

export const adminRouter = router({
  /**
   * 전체 캠페인 목록 (관리자용 — 모든 유저)
   */
  allCampaigns: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.limit;

      const [data, totalResult] = await Promise.all([
        ctx.db
          .select()
          .from(marketingCampaigns)
          .orderBy(desc(marketingCampaigns.createdAt))
          .limit(input.limit)
          .offset(offset),
        ctx.db.select({ count: count() }).from(marketingCampaigns),
      ]);

      const total = totalResult[0]?.count ?? 0;

      return buildPaginatedResult(data, total, input.page, input.limit);
    }),

  /**
   * 전체 콘텐츠 목록 (관리자용 — 모든 유저)
   */
  allContents: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(50).default(20),
      }),
    )
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.limit;

      const [data, totalResult] = await Promise.all([
        ctx.db
          .select()
          .from(marketingContents)
          .orderBy(desc(marketingContents.createdAt))
          .limit(input.limit)
          .offset(offset),
        ctx.db.select({ count: count() }).from(marketingContents),
      ]);

      const total = totalResult[0]?.count ?? 0;

      return buildPaginatedResult(data, total, input.page, input.limit);
    }),

  /**
   * 마케팅 전체 통계 (관리자용)
   */
  stats: adminProcedure.query(async ({ ctx }) => {
    const [campaignCount, contentCount, publicationCount, accountCount] =
      await Promise.all([
        ctx.db.select({ count: count() }).from(marketingCampaigns),
        ctx.db.select({ count: count() }).from(marketingContents),
        ctx.db.select({ count: count() }).from(marketingPublications),
        ctx.db.select({ count: count() }).from(marketingSnsAccounts),
      ]);

    // 상태별 발행 통계
    const publicationsByStatus = await ctx.db
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
  }),
});

export type AdminRouterType = typeof adminRouter;
