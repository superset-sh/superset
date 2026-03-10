/**
 * Booking Matching tRPC Router
 *
 * 상담사 탐색 및 매칭 점수 기반 추천 프로시저
 */
import { router, publicProcedure } from "../../../core/trpc";
import { searchProvidersSchema } from "../dto";
import { getBookingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const matchingRouter = router({
  // ==========================================================================
  // Public Procedures
  // ==========================================================================

  /**
   * 상담사 검색 (필터 + 페이지네이션)
   */
  search: publicProcedure
    .input(searchProvidersSchema)
    .query(async ({ input }) => {
      const { matchingService } = getBookingServices();
      return matchingService.searchProviders(input);
    }),

  /**
   * 매칭 점수 기반 상담사 추천
   */
  match: publicProcedure
    .input(searchProvidersSchema)
    .query(async ({ input }) => {
      const { matchingService } = getBookingServices();
      return matchingService.getMatchResults(input);
    }),
});

export type MatchingRouterType = typeof matchingRouter;
