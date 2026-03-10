/**
 * Booking Provider tRPC Router
 *
 * 상담사 프로필 공개 조회 및 본인 관리 프로시저
 * Admin 상담사 관리는 admin.route.ts에서 처리
 */
import { z } from "zod";
import {
  router,
  publicProcedure,
  authProcedure,
  getAuthUserId,
} from "../../../core/trpc";
import {
  createProviderSchema,
  updateProviderProfileSchema,
} from "../dto";
import { getBookingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const providerRouter = router({
  // ==========================================================================
  // Public Procedures
  // ==========================================================================

  /**
   * 활성 상담사 공개 목록
   */
  list: publicProcedure.query(async () => {
    const { providerService } = getBookingServices();
    return providerService.getActiveProviders();
  }),

  /**
   * ID로 상담사 상세 조회
   */
  byId: publicProcedure
    .input(z.string().uuid().describe("상담사 ID"))
    .query(async ({ input }) => {
      const { providerService } = getBookingServices();
      return providerService.getProviderWithDetails(input);
    }),

  // ==========================================================================
  // Auth Procedures
  // ==========================================================================

  /**
   * 상담사 등록
   */
  register: authProcedure
    .input(createProviderSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { providerService } = getBookingServices();
      return providerService.register(userId, input);
    }),

  /**
   * 상담사 프로필 수정 (본인)
   */
  updateProfile: authProcedure
    .input(updateProviderProfileSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { providerService } = getBookingServices();
      return providerService.updateProfile(userId, input);
    }),

  /**
   * 내 상담사 프로필 조회
   */
  myProfile: authProcedure.query(async ({ ctx }) => {
    const userId = getAuthUserId(ctx);
    const { providerService } = getBookingServices();
    return providerService.getMyProfile(userId);
  }),
});

export type ProviderRouterType = typeof providerRouter;
