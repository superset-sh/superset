/**
 * Booking tRPC Router
 *
 * 예약 생성, 결제 확인, 조회, 상태 변경 프로시저
 * Admin 예약 관리는 admin.route.ts에서 처리
 */
import { z } from "zod";
import { router, authProcedure, getAuthUserId } from "../../../core/trpc";
import { createBookingSchema, bookingQuerySchema } from "../dto";
import { getBookingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const bookingRouter = router({
  // ==========================================================================
  // Auth Procedures
  // ==========================================================================

  /**
   * 예약 생성
   */
  create: authProcedure
    .input(createBookingSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { bookingService } = getBookingServices();
      return bookingService.create(userId, input);
    }),

  /**
   * 결제 확인
   */
  confirmPayment: authProcedure
    .input(
      z.object({
        bookingId: z.string().uuid().describe("예약 ID"),
        paymentReference: z.string().min(1).describe("결제 참조 번호"),
      }),
    )
    .mutation(async ({ input }) => {
      const { bookingService } = getBookingServices();
      return bookingService.confirmPayment(
        input.bookingId,
        input.paymentReference,
      );
    }),

  /**
   * 내 예약 목록 (고객)
   */
  myBookings: authProcedure
    .input(bookingQuerySchema)
    .query(async ({ input, ctx }) => {
      const userId = getAuthUserId(ctx);
      const { bookingService } = getBookingServices();
      return bookingService.getCustomerBookings(userId, input);
    }),

  /**
   * 상담사의 예약 목록
   */
  providerBookings: authProcedure
    .input(
      z.object({
        providerId: z.string().uuid().describe("상담사 ID"),
        query: bookingQuerySchema,
      }),
    )
    .query(async ({ input }) => {
      const { bookingService } = getBookingServices();
      return bookingService.getProviderBookings(
        input.providerId,
        input.query,
      );
    }),

  /**
   * 예약 상세 조회
   */
  byId: authProcedure
    .input(z.string().uuid().describe("예약 ID"))
    .query(async ({ input }) => {
      const { bookingService } = getBookingServices();
      return bookingService.getBookingWithDetails(input);
    }),

  /**
   * 세션 완료 처리 (상담사용)
   */
  complete: authProcedure
    .input(z.string().uuid().describe("예약 ID"))
    .mutation(async ({ input }) => {
      const { bookingService } = getBookingServices();
      return bookingService.completeSession(input);
    }),

  /**
   * 노쇼 처리 (상담사용)
   */
  markNoShow: authProcedure
    .input(z.string().uuid().describe("예약 ID"))
    .mutation(async ({ input }) => {
      const { bookingService } = getBookingServices();
      return bookingService.markNoShow(input);
    }),
});

export type BookingRouterType = typeof bookingRouter;
