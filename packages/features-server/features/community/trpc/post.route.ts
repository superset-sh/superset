/**
 * Community Post tRPC Router
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, authProcedure, getAuthUserId } from "../../../core/trpc";
import { ErrorCode } from "../../../shared/errors";
import { updatePostSchema } from "../dto";
import { getCommunityServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const postRouter = router({
  // ==========================================================================
  // Public Procedures
  // ==========================================================================

  /**
   * 게시물 목록 조회 (cursor pagination, 최신순)
   */
  list: publicProcedure
    .input(
      z.object({
        communitySlug: z.string().optional(),
        communityId: z.string().uuid().optional(),
        sort: z.enum(["new"]).default("new"),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(25),
      })
    )
    .query(async ({ input }) => {
      const { postService } = getCommunityServices();
      return postService.findAll(input);
    }),

  /**
   * ID로 게시물 조회
   */
  byId: publicProcedure
    .input(z.string().uuid().describe("Post ID"))
    .query(async ({ input }) => {
      const { postService } = getCommunityServices();
      const post = await postService.findById(input);
      if (!post) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "게시글을 찾을 수 없습니다.",
          cause: { errorCode: ErrorCode.RESOURCE_NOT_FOUND },
        });
      }
      return post;
    }),

  /**
   * 게시물의 댓글 조회 (cursor pagination)
   */
  comments: publicProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        sort: z.enum(["old", "new"]).default("old"),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const { commentService } = getCommunityServices();
      return commentService.findByPost(input);
    }),

  // ==========================================================================
  // Auth Procedures
  // ==========================================================================

  /**
   * 게시물 생성 (MVP: text only, slug-based)
   */
  create: authProcedure
    .input(
      z.object({
        communitySlug: z.string(),
        title: z.string().min(1).max(300),
        content: z.string().min(1),
        type: z.enum(["text"]).default("text"),
        isNsfw: z.boolean().default(false),
        isSpoiler: z.boolean().default(false),
        isOc: z.boolean().default(false),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { postService, communityService, rateLimitService } = getCommunityServices();

      // Resolve slug → communityId
      const community = await communityService.findBySlug(input.communitySlug);
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "커뮤니티를 찾을 수 없습니다.",
          cause: { errorCode: ErrorCode.COMMUNITY_NOT_FOUND },
        });
      }

      // Rate limit: 5 posts per minute
      await rateLimitService.assertRateLimit(userId, {
        action: "community:post:create",
        maxRequests: 5,
        windowSeconds: 60,
      });

      return postService.create(
        { ...input, communityId: community.id },
        userId,
      );
    }),

  /**
   * 게시물 업데이트
   */
  update: authProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        data: updatePostSchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { postService } = getCommunityServices();

      return postService.update(input.id, input.data, userId);
    }),

  /**
   * 게시물 삭제
   */
  delete: authProcedure
    .input(z.string().uuid().describe("Post ID"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { postService } = getCommunityServices();

      await postService.delete(input, userId);
      return { success: true };
    }),

  /**
   * 게시물 고정 (Moderator)
   */
  pin: authProcedure
    .input(z.string().uuid().describe("Post ID"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { postService } = getCommunityServices();

      return postService.pin(input, userId);
    }),

  /**
   * 게시물 잠금 (Moderator)
   */
  lock: authProcedure
    .input(z.string().uuid().describe("Post ID"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { postService } = getCommunityServices();

      return postService.lock(input, userId);
    }),

  /**
   * 게시물 제거 (Moderator)
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
      const { postService } = getCommunityServices();

      return postService.remove(input.id, input.reason, userId);
    }),

  /**
   * 교차 게시
   */
  crosspost: authProcedure
    .input(
      z.object({
        postId: z.string().uuid(),
        targetCommunityId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { postService } = getCommunityServices();

      return postService.crosspost(input.postId, input.targetCommunityId, userId);
    }),
});

export type PostRouterType = typeof postRouter;
