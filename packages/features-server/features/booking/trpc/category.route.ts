/**
 * Booking Category tRPC Router
 *
 * 공개 카테고리 조회 프로시저
 * Admin 카테고리 관리는 admin.route.ts에서 처리
 */
import { z } from "zod";
import { router, publicProcedure } from "../../../core/trpc";
import { getBookingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const categoryRouter = router({
  // ==========================================================================
  // Public Procedures
  // ==========================================================================

  /**
   * 활성 카테고리 목록 조회
   */
  list: publicProcedure.query(async () => {
    const { categoryService } = getBookingServices();
    return categoryService.findAll();
  }),

  /**
   * Slug로 카테고리 조회
   */
  bySlug: publicProcedure
    .input(z.string().describe("카테고리 slug"))
    .query(async ({ input }) => {
      const { categoryService } = getBookingServices();
      return categoryService.findBySlug(input);
    }),
});

export type CategoryRouterType = typeof categoryRouter;
