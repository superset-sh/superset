/**
 * Community Comment tRPC Router
 */
import { z } from "zod";
import { router, authProcedure, getAuthUserId } from "../../../core/trpc";
import { createCommentSchema } from "../dto";
import { getCommunityServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const commentRouter = router({
  /**
   * 댓글 생성
   */
  create: authProcedure.input(createCommentSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { commentService, rateLimitService } = getCommunityServices();

    // Rate limit: 10 comments per minute
    await rateLimitService.assertRateLimit(userId, {
      action: "community:comment:create",
      maxRequests: 10,
      windowSeconds: 60,
    });

    return commentService.create(input, userId);
  }),

  /**
   * 댓글 업데이트
   */
  update: authProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        content: z.string().min(1).max(10000),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { commentService } = getCommunityServices();

      return commentService.update(input.id, input.content, userId);
    }),

  /**
   * 댓글 삭제
   */
  delete: authProcedure
    .input(z.string().uuid().describe("Comment ID"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { commentService } = getCommunityServices();

      await commentService.delete(input, userId);
      return { success: true };
    }),

  /**
   * 댓글 제거 (Moderator)
   */
  remove: authProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { commentService } = getCommunityServices();

      return commentService.remove(input.id, input.reason, userId);
    }),

  /**
   * 댓글 고정 (Moderator)
   */
  sticky: authProcedure
    .input(z.string().uuid().describe("Comment ID"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { commentService } = getCommunityServices();

      return commentService.sticky(input, userId);
    }),

  /**
   * 모더레이터 표시
   */
  distinguish: authProcedure
    .input(z.string().uuid().describe("Comment ID"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { commentService } = getCommunityServices();

      return commentService.distinguish(input, userId);
    }),
});

export type CommentRouterType = typeof commentRouter;
