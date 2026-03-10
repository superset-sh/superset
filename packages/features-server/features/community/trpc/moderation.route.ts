/**
 * Community Moderation tRPC Router
 */
import { z } from "zod";
import { router, authProcedure, getAuthUserId } from "../../../core/trpc";
import {
  createReportSchema,
  resolveReportSchema,
  banUserSchema,
  createRuleSchema,
  createFlairSchema,
  inviteModeratorSchema,
} from "../dto";
import { getCommunityServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const moderationRouter = router({
  // ==========================================================================
  // 신고 (모든 인증된 사용자)
  // ==========================================================================

  /**
   * 신고 생성
   */
  report: authProcedure.input(createReportSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { moderationService } = getCommunityServices();

    return moderationService.createReport(input, userId);
  }),

  // ==========================================================================
  // 모더레이터 전용
  // ==========================================================================

  /**
   * Mod Queue 조회
   */
  queue: authProcedure
    .input(z.object({ communityId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { moderationService } = getCommunityServices();
      return moderationService.getModQueue(input.communityId);
    }),

  /**
   * 신고 목록
   */
  reports: authProcedure
    .input(
      z.object({
        communityId: z.string().uuid(),
        status: z.enum(["pending", "reviewing", "resolved", "dismissed"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const { moderationService } = getCommunityServices();
      return moderationService.getReports(input.communityId, input.status);
    }),

  /**
   * 신고 처리
   */
  resolveReport: authProcedure.input(resolveReportSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { moderationService } = getCommunityServices();

    return moderationService.resolveReport(input, userId);
  }),

  /**
   * 사용자 밴
   */
  banUser: authProcedure.input(banUserSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { moderationService } = getCommunityServices();

    return moderationService.banUser(input, userId);
  }),

  /**
   * 밴 해제
   */
  unbanUser: authProcedure
    .input(
      z.object({
        communityId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { moderationService } = getCommunityServices();

      await moderationService.unbanUser(input.communityId, input.userId, userId);
      return { success: true };
    }),

  /**
   * 밴된 사용자 목록
   */
  bannedUsers: authProcedure
    .input(z.object({ communityId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { moderationService } = getCommunityServices();
      return moderationService.getBannedUsers(input.communityId);
    }),

  /**
   * 규칙 생성
   */
  createRule: authProcedure.input(createRuleSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { moderationService } = getCommunityServices();

    return moderationService.createRule(input, userId);
  }),

  /**
   * 규칙 목록
   */
  rules: authProcedure
    .input(z.object({ communityId: z.string().uuid() }))
    .query(async ({ input }) => {
      const { moderationService } = getCommunityServices();
      return moderationService.getRules(input.communityId);
    }),

  /**
   * 플레어 생성
   */
  createFlair: authProcedure.input(createFlairSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { moderationService } = getCommunityServices();

    return moderationService.createFlair(input, userId);
  }),

  /**
   * 플레어 목록
   */
  flairs: authProcedure
    .input(
      z.object({
        communityId: z.string().uuid(),
        type: z.enum(["post", "user"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const { moderationService } = getCommunityServices();
      return moderationService.getFlairs(input.communityId, input.type);
    }),

  /**
   * 모더레이터 초대
   */
  inviteModerator: authProcedure.input(inviteModeratorSchema).mutation(async ({ input, ctx }) => {
    const userId = getAuthUserId(ctx);
    const { moderationService } = getCommunityServices();

    return moderationService.inviteModerator(input, userId);
  }),

  /**
   * 모더레이터 제거
   */
  removeModerator: authProcedure
    .input(
      z.object({
        communityId: z.string().uuid(),
        userId: z.string().uuid(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { moderationService } = getCommunityServices();

      await moderationService.removeModerator(input.communityId, input.userId, userId);
      return { success: true };
    }),

  /**
   * Mod Log 조회
   */
  logs: authProcedure
    .input(
      z.object({
        communityId: z.string().uuid(),
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(50),
      })
    )
    .query(async ({ input }) => {
      const { moderationService } = getCommunityServices();
      return moderationService.getModLogs(input.communityId, input.page, input.limit);
    }),
});

export type ModerationRouterType = typeof moderationRouter;
