/**
 * Booking Session Product tRPC Router
 *
 * 세션 상품 공개 조회 및 상담사 상품 관리 프로시저
 * Admin 상품 관리는 admin.route.ts에서 처리
 */
import { z } from "zod";
import {
  router,
  publicProcedure,
  authProcedure,
} from "../../../core/trpc";
import { getBookingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const productRouter = router({
  // ==========================================================================
  // Public Procedures
  // ==========================================================================

  /**
   * 활성 세션 상품 목록
   */
  list: publicProcedure.query(async () => {
    const { sessionProductService } = getBookingServices();
    return sessionProductService.findAll();
  }),

  /**
   * ID로 세션 상품 조회
   */
  byId: publicProcedure
    .input(z.string().uuid().describe("상품 ID"))
    .query(async ({ input }) => {
      const { sessionProductService } = getBookingServices();
      return sessionProductService.findById(input);
    }),

  // ==========================================================================
  // Auth Procedures (상담사용)
  // ==========================================================================

  /**
   * 상담사의 활성 상품 목록 조회
   */
  providerProducts: authProcedure
    .input(z.string().uuid().describe("상담사 ID"))
    .query(async ({ input }) => {
      const { sessionProductService } = getBookingServices();
      return sessionProductService.getProviderProducts(input);
    }),

  /**
   * 상담사가 상품 활성화 (상담사-상품 연결)
   */
  activate: authProcedure
    .input(
      z.object({
        providerId: z.string().uuid().describe("상담사 ID"),
        productId: z.string().uuid().describe("상품 ID"),
      }),
    )
    .mutation(async ({ input }) => {
      const { sessionProductService } = getBookingServices();
      return sessionProductService.activateForProvider(
        input.providerId,
        input.productId,
      );
    }),

  /**
   * 상담사가 상품 비활성화
   */
  deactivate: authProcedure
    .input(
      z.object({
        providerId: z.string().uuid().describe("상담사 ID"),
        productId: z.string().uuid().describe("상품 ID"),
      }),
    )
    .mutation(async ({ input }) => {
      const { sessionProductService } = getBookingServices();
      return sessionProductService.deactivateForProvider(
        input.providerId,
        input.productId,
      );
    }),
});

export type ProductRouterType = typeof productRouter;
