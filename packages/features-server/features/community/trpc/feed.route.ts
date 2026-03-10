/**
 * Community Feed tRPC Router
 */
import { z } from "zod";
import { router, publicProcedure, authProcedure, getAuthUserId } from "../../../core/trpc";
import { getCommunityServices } from "./index";

// ============================================================================
// Router
// ============================================================================

const feedOptionsSchema = z.object({
  sort: z.enum(["hot", "new", "top", "rising", "controversial"]).default("hot"),
  timeFilter: z.enum(["hour", "day", "week", "month", "year", "all"]).default("day"),
  page: z.number().min(1).default(1),
  limit: z.number().min(1).max(100).default(25),
});

export const feedRouter = router({
  /**
   * 홈 피드 (구독 커뮤니티)
   */
  home: authProcedure.input(feedOptionsSchema).query(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { feedService } = getCommunityServices();

    return feedService.getHomeFeed(userId, input);
  }),

  /**
   * 전체 피드 (모든 공개 커뮤니티)
   */
  all: publicProcedure.input(feedOptionsSchema).query(async ({ input }) => {
    const { feedService } = getCommunityServices();
    return feedService.getAllFeed(input);
  }),

  /**
   * 인기 피드
   */
  popular: publicProcedure
    .input(
      z.object({
        timeFilter: z.enum(["hour", "day", "week", "month", "year", "all"]).default("day"),
        limit: z.number().min(1).max(100).default(25),
      })
    )
    .query(async ({ input }) => {
      const { feedService } = getCommunityServices();
      return feedService.getPopularFeed(input);
    }),
});

export type FeedRouterType = typeof feedRouter;
