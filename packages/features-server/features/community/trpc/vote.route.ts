/**
 * Community Vote tRPC Router
 */
import { router, authProcedure, getAuthUserId } from "../../../core/trpc";
import { voteSchema, removeVoteSchema } from "../dto";
import { getCommunityServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const voteRouter = router({
  /**
   * 투표하기
   */
  cast: authProcedure.input(voteSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { voteService, rateLimitService } = getCommunityServices();

    // Rate limit: 60 votes per minute
    await rateLimitService.assertRateLimit(userId, {
      action: "community:vote:cast",
      maxRequests: 60,
      windowSeconds: 60,
    });

    return voteService.vote(input, userId);
  }),

  /**
   * 투표 취소
   */
  remove: authProcedure.input(removeVoteSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { voteService } = getCommunityServices();

    return voteService.removeVote(input, userId);
  }),
});

export type VoteRouterType = typeof voteRouter;
