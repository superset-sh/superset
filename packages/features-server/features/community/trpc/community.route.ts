/**
 * Community tRPC Router
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, publicProcedure, authProcedure, getAuthUserId } from "../../../core/trpc";
import { ErrorCode } from "../../../shared/errors";
import {
  createCommunitySchema,
  updateCommunitySchema,
} from "../dto";
import { getCommunityServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const communityRouter = router({
  // ==========================================================================
  // Public Procedures
  // ==========================================================================

  /**
   * 커뮤니티 목록 조회 (cursor pagination)
   */
  list: publicProcedure
    .input(
      z.object({
        search: z.string().optional(),
        type: z.enum(["public", "restricted", "private"]).optional(),
        sort: z.enum(["newest", "popular", "name"]).default("newest"),
        cursor: z.string().optional(),
        limit: z.number().min(1).max(50).default(20),
      })
    )
    .query(async ({ input }) => {
      const { communityService } = getCommunityServices();
      return communityService.findAll(input);
    }),

  /**
   * Slug로 커뮤니티 조회
   */
  bySlug: publicProcedure
    .input(z.string().describe("Community slug"))
    .query(async ({ input }) => {
      const { communityService } = getCommunityServices();
      const community = await communityService.findBySlug(input);
      if (!community) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "커뮤니티를 찾을 수 없습니다",
          cause: { errorCode: ErrorCode.COMMUNITY_NOT_FOUND },
        });
      }
      return community;
    }),

  /**
   * 인기 커뮤니티
   */
  popular: publicProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(10),
      })
    )
    .query(async ({ input }) => {
      const { communityService } = getCommunityServices();
      return communityService.findPopular(input.limit);
    }),

  /**
   * 커뮤니티 멤버 목록
   */
  members: publicProcedure
    .input(
      z.object({
        slug: z.string(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const { communityService } = getCommunityServices();
      return communityService.getMembers(input.slug, {
        page: input.page,
        limit: input.limit,
      });
    }),

  /**
   * 모더레이터 목록
   */
  moderators: publicProcedure
    .input(z.string().describe("Community slug"))
    .query(async ({ input }) => {
      const { communityService } = getCommunityServices();
      return communityService.getModerators(input);
    }),

  // ==========================================================================
  // Auth Procedures
  // ==========================================================================

  /**
   * 커뮤니티 생성
   */
  create: authProcedure.input(createCommunitySchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { communityService, rateLimitService } = getCommunityServices();

    // 관리자 전용 생성 모드
    if (process.env.COMMUNITY_CREATE_ADMIN_ONLY === "true") {
      const adminIds = (process.env.COMMUNITY_ADMIN_IDS ?? "").split(",").filter(Boolean);
      if (!adminIds.includes(userId)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "커뮤니티 생성은 관리자만 가능합니다.",
          cause: { errorCode: ErrorCode.ADMIN_REQUIRED },
        });
      }
    }

    // Rate limit: 1 community creation per day
    await rateLimitService.assertRateLimit(userId, {
      action: "community:create",
      maxRequests: 1,
      windowSeconds: 86400,
    });

    return communityService.create(input, userId);
  }),

  /**
   * 커뮤니티 업데이트
   */
  update: authProcedure
    .input(
      z.object({
        slug: z.string(),
        data: updateCommunitySchema,
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { communityService } = getCommunityServices();

      return communityService.update(input.slug, input.data, userId);
    }),

  /**
   * 커뮤니티 삭제
   */
  delete: authProcedure
    .input(z.string().describe("Community slug"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { communityService } = getCommunityServices();

      await communityService.delete(input, userId);
      return { success: true };
    }),

  /**
   * 현재 사용자의 멤버십 조회
   */
  myMembership: authProcedure
    .input(z.string().describe("Community slug"))
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { communityService } = getCommunityServices();

      const community = await communityService.findBySlug(input);
      if (!community) {
        return null;
      }

      return communityService.getMembership(community.id, userId);
    }),

  /**
   * 커뮤니티 가입
   */
  join: authProcedure
    .input(z.string().describe("Community slug"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { communityService, rateLimitService } = getCommunityServices();

      // Rate limit: 10 join/leave per minute
      await rateLimitService.assertRateLimit(userId, {
        action: "community:join",
        maxRequests: 10,
        windowSeconds: 60,
      });

      return communityService.join(input, userId);
    }),

  /**
   * 커뮤니티 탈퇴
   */
  leave: authProcedure
    .input(z.string().describe("Community slug"))
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { communityService, rateLimitService } = getCommunityServices();

      // Rate limit: 10 join/leave per minute
      await rateLimitService.assertRateLimit(userId, {
        action: "community:leave",
        maxRequests: 10,
        windowSeconds: 60,
      });

      await communityService.leave(input, userId);
      return { success: true };
    }),

  /**
   * 내 구독 커뮤니티
   */
  mySubscriptions: authProcedure.query(async ({ ctx }) => {
    const userId = getAuthUserId(ctx);
    const { communityService } = getCommunityServices();

    return communityService.findUserSubscriptions(userId);
  }),
});

export type CommunityRouterType = typeof communityRouter;
