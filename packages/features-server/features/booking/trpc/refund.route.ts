/**
 * Booking Refund tRPC Router
 *
 * 환불 미리보기, 고객 취소, 상담사 취소 프로시저
 * Admin 환불 정책 관리는 admin.route.ts에서 처리
 */
import { z } from "zod";
import { router, authProcedure, getAuthUserId } from "../../../core/trpc";
import { getBookingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const refundRouter = router({
  // ==========================================================================
  // Auth Procedures
  // ==========================================================================

  /**
   * 환불 미리보기 (금액/비율 확인)
   */
  preview: authProcedure
    .input(z.string().uuid().describe("예약 ID"))
    .query(async ({ input }) => {
      const { refundService } = getBookingServices();
      return refundService.getRefundPreview(input);
    }),

  /**
   * 고객 취소 + 환불 처리
   */
  cancel: authProcedure
    .input(
      z.object({
        bookingId: z.string().uuid().describe("예약 ID"),
        reason: z.string().optional().describe("취소 사유"),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { refundService } = getBookingServices();
      return refundService.processCustomerCancellation(
        input.bookingId,
        userId,
        input.reason,
      );
    }),

  /**
   * 상담사 취소 + 환불 처리
   */
  providerCancel: authProcedure
    .input(
      z.object({
        bookingId: z.string().uuid().describe("예약 ID"),
        providerId: z.string().uuid().describe("상담사 ID"),
        reason: z.string().optional().describe("취소 사유"),
      }),
    )
    .mutation(async ({ input }) => {
      const { refundService } = getBookingServices();
      return refundService.processProviderCancellation(
        input.bookingId,
        input.providerId,
        input.reason,
      );
    }),
});

export type RefundRouterType = typeof refundRouter;
