/**
 * Community Admin tRPC Router
 *
 * 시스템 관리자 전용 커뮤니티 관리 프로시저
 */
import { z } from "zod";
import { router, adminProcedure, getAuthUserId } from "../../../core/trpc";
import { resolveReportSchema, banUserSchema } from "../dto";
import { getCommunityServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const communityAdminRouter = router({
  // ==========================================================================
  // 커뮤니티 관리
  // ==========================================================================

  /**
   * 커뮤니티 목록 (offset pagination)
   */
  list: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        type: z.enum(["public", "restricted", "private"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const { communityService } = getCommunityServices();
      return communityService.adminFindAll(input);
    }),

  /**
   * 커뮤니티 삭제
   */
  delete: adminProcedure
    .input(z.object({ communityId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const { communityService } = getCommunityServices();
      return communityService.adminDelete(input.communityId);
    }),

  /**
   * 전체 통계
   */
  stats: adminProcedure.query(async () => {
    const { communityService } = getCommunityServices();
    return communityService.getSystemStats();
  }),

  // ==========================================================================
  // 신고 관리
  // ==========================================================================

  /**
   * 전체 신고 목록 (cross-community)
   */
  reports: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        status: z.enum(["pending", "reviewing", "resolved", "dismissed"]).optional(),
      })
    )
    .query(async ({ input }) => {
      const { moderationService } = getCommunityServices();
      return moderationService.getAllReports(input);
    }),

  /**
   * 신고 통계
   */
  reportStats: adminProcedure.query(async () => {
    const { moderationService } = getCommunityServices();
    return moderationService.getReportStats();
  }),

  /**
   * 신고 처리 (admin 권한)
   */
  resolveReport: adminProcedure
    .input(resolveReportSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { moderationService } = getCommunityServices();
      return moderationService.resolveReport(input, userId);
    }),

  // ==========================================================================
  // 사용자 밴 관리
  // ==========================================================================

  /**
   * 사용자 밴 (admin 권한)
   */
  banUser: adminProcedure
    .input(banUserSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { moderationService } = getCommunityServices();
      return moderationService.banUser(input, userId);
    }),

  /**
   * 밴 해제
   */
  unbanUser: adminProcedure
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
});

export type CommunityAdminRouterType = typeof communityAdminRouter;
