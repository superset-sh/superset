/**
 * Booking Admin tRPC Router
 *
 * 시스템 관리자 전용 예약/상담사/상품/환불정책 관리 프로시저
 */
import { z } from "zod";
import { router, adminProcedure } from "../../../core/trpc";
import {
  createCategorySchema,
  updateCategorySchema,
  createProviderSchema,
  updateProviderStatusSchema,
  createSessionProductSchema,
  updateSessionProductSchema,
  bookingQuerySchema,
  updateRefundPolicySchema,
} from "../dto";
import { getBookingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const bookingAdminRouter = router({
  // ==========================================================================
  // 카테고리 관리
  // ==========================================================================

  categories: router({
    /**
     * 전체 카테고리 목록 (비활성 포함, 페이지네이션)
     */
    list: adminProcedure
      .input(
        z.object({
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
          search: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        const { categoryService } = getBookingServices();
        return categoryService.adminFindAll(input);
      }),

    /**
     * 카테고리 생성
     */
    create: adminProcedure
      .input(createCategorySchema)
      .mutation(async ({ input }) => {
        const { categoryService } = getBookingServices();
        return categoryService.create(input);
      }),

    /**
     * 카테고리 수정
     */
    update: adminProcedure
      .input(
        z.object({
          id: z.string().uuid().describe("카테고리 ID"),
          data: updateCategorySchema,
        }),
      )
      .mutation(async ({ input }) => {
        const { categoryService } = getBookingServices();
        return categoryService.update(input.id, input.data);
      }),

    /**
     * 카테고리 삭제
     */
    delete: adminProcedure
      .input(z.string().uuid().describe("카테고리 ID"))
      .mutation(async ({ input }) => {
        const { categoryService } = getBookingServices();
        return categoryService.delete(input);
      }),

    /**
     * 카테고리 정렬 순서 변경
     */
    reorder: adminProcedure
      .input(
        z.array(
          z.object({
            id: z.string().uuid().describe("카테고리 ID"),
            sortOrder: z.number().int().describe("정렬 순서"),
          }),
        ),
      )
      .mutation(async ({ input }) => {
        const { categoryService } = getBookingServices();
        return categoryService.reorder(input);
      }),

    /**
     * 카테고리 활성/비활성 토글
     */
    toggleActive: adminProcedure
      .input(z.string().uuid().describe("카테고리 ID"))
      .mutation(async ({ input }) => {
        const { categoryService } = getBookingServices();
        return categoryService.toggleActive(input);
      }),
  }),

  // ==========================================================================
  // 상담사 관리
  // ==========================================================================

  providers: router({
    /**
     * 전체 상담사 목록 (페이지네이션)
     */
    list: adminProcedure
      .input(
        z.object({
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
          status: z.string().optional(),
          search: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        const { providerService } = getBookingServices();
        return providerService.listProviders(input);
      }),

    /**
     * 상담사 상세 조회
     */
    getDetail: adminProcedure
      .input(z.string().uuid().describe("상담사 ID"))
      .query(async ({ input }) => {
        const { providerService } = getBookingServices();
        return providerService.getProviderWithDetails(input);
      }),

    /**
     * 관리자에서 상담사 등록
     */
    register: adminProcedure
      .input(
        z.object({
          userId: z.string().uuid().describe("프로필 ID (유저)"),
          data: createProviderSchema,
        }),
      )
      .mutation(async ({ input }) => {
        const { providerService } = getBookingServices();
        return providerService.register(input.userId, input.data);
      }),

    /**
     * 상담사 상태 변경 (Admin 전용)
     */
    updateStatus: adminProcedure
      .input(
        z.object({
          id: z.string().uuid().describe("상담사 ID"),
          data: updateProviderStatusSchema,
        }),
      )
      .mutation(async ({ input }) => {
        const { providerService } = getBookingServices();
        return providerService.updateStatus(input.id, input.data, {
          isAdmin: true,
        });
      }),
  }),

  // ==========================================================================
  // 세션 상품 관리
  // ==========================================================================

  products: router({
    /**
     * 전체 세션 상품 목록 (비활성 포함, 페이지네이션)
     */
    list: adminProcedure
      .input(
        z.object({
          page: z.number().int().min(1).default(1),
          limit: z.number().int().min(1).max(100).default(20),
          search: z.string().optional(),
        }),
      )
      .query(async ({ input }) => {
        const { sessionProductService } = getBookingServices();
        return sessionProductService.adminFindAll(input);
      }),

    /**
     * 세션 상품 생성
     */
    create: adminProcedure
      .input(createSessionProductSchema)
      .mutation(async ({ input }) => {
        const { sessionProductService } = getBookingServices();
        return sessionProductService.create(input);
      }),

    /**
     * 세션 상품 수정
     */
    update: adminProcedure
      .input(
        z.object({
          id: z.string().uuid().describe("상품 ID"),
          data: updateSessionProductSchema,
        }),
      )
      .mutation(async ({ input }) => {
        const { sessionProductService } = getBookingServices();
        return sessionProductService.update(input.id, input.data);
      }),

    /**
     * 세션 상품 삭제
     */
    delete: adminProcedure
      .input(z.string().uuid().describe("상품 ID"))
      .mutation(async ({ input }) => {
        const { sessionProductService } = getBookingServices();
        return sessionProductService.delete(input);
      }),

    /**
     * 세션 상품 상태 토글 (active <-> inactive)
     */
    toggleStatus: adminProcedure
      .input(z.string().uuid().describe("상품 ID"))
      .mutation(async ({ input }) => {
        const { sessionProductService } = getBookingServices();
        return sessionProductService.toggleStatus(input);
      }),
  }),

  // ==========================================================================
  // 예약 관리
  // ==========================================================================

  bookings: router({
    /**
     * 전체 예약 목록 (고객/상담사/상품 이름 포함)
     */
    list: adminProcedure.input(bookingQuerySchema).query(async ({ input }) => {
      const { bookingService } = getBookingServices();
      return bookingService.adminFindAllWithDetails(input);
    }),

    /**
     * 예약 상세 조회
     */
    getDetail: adminProcedure
      .input(z.string().uuid().describe("예약 ID"))
      .query(async ({ input }) => {
        const { bookingService } = getBookingServices();
        return bookingService.getBookingWithDetails(input);
      }),

    /**
     * 관리자 강제 취소 (고객 취소로 처리)
     */
    forceCancel: adminProcedure
      .input(
        z.object({
          bookingId: z.string().uuid().describe("예약 ID"),
          reason: z.string().optional().describe("취소 사유"),
        }),
      )
      .mutation(async ({ input }) => {
        const { bookingService } = getBookingServices();
        return bookingService.updateStatus(input.bookingId, "cancelled_by_user", {
          cancellationReason: input.reason,
        });
      }),

    /**
     * 관리자 강제 완료
     */
    forceComplete: adminProcedure
      .input(z.string().uuid().describe("예약 ID"))
      .mutation(async ({ input }) => {
        const { bookingService } = getBookingServices();
        return bookingService.completeSession(input);
      }),

    /**
     * 관리자 강제 노쇼 처리
     */
    forceNoShow: adminProcedure
      .input(z.string().uuid().describe("예약 ID"))
      .mutation(async ({ input }) => {
        const { bookingService } = getBookingServices();
        return bookingService.markNoShow(input);
      }),

    /**
     * 관리자 강제 환불
     */
    forceRefund: adminProcedure
      .input(
        z.object({
          bookingId: z.string().uuid().describe("예약 ID"),
          refundAmount: z.number().int().min(0).describe("환불 금액"),
        }),
      )
      .mutation(async ({ input }) => {
        const { refundService } = getBookingServices();
        return refundService.processAdminRefund(
          input.bookingId,
          input.refundAmount,
        );
      }),
  }),

  // ==========================================================================
  // 환불 정책 관리
  // ==========================================================================

  refundPolicy: router({
    /**
     * 활성 환불 정책 목록
     */
    list: adminProcedure.query(async () => {
      const { refundService } = getBookingServices();
      return refundService.findAllPolicies();
    }),

    /**
     * 환불 정책 생성
     */
    create: adminProcedure
      .input(
        updateRefundPolicySchema.extend({
          isDefault: z.boolean().optional().describe("기본 정책 여부"),
        }),
      )
      .mutation(async ({ input }) => {
        const { refundService } = getBookingServices();
        return refundService.createPolicy(input);
      }),

    /**
     * 환불 정책 수정
     */
    update: adminProcedure
      .input(
        z.object({
          id: z.string().uuid().describe("정책 ID"),
          data: updateRefundPolicySchema.extend({
            isDefault: z.boolean().optional().describe("기본 정책 여부"),
          }),
        }),
      )
      .mutation(async ({ input }) => {
        const { refundService } = getBookingServices();
        return refundService.updatePolicy(input.id, input.data);
      }),

    /**
     * 환불 정책 삭제
     */
    delete: adminProcedure
      .input(z.string().uuid().describe("정책 ID"))
      .mutation(async ({ input }) => {
        const { refundService } = getBookingServices();
        return refundService.deletePolicy(input);
      }),
  }),

  // ==========================================================================
  // 통합 통계 (enhanced)
  // ==========================================================================

  /**
   * Booking 시스템 통합 통계
   */
  stats: adminProcedure.query(async () => {
    const {
      categoryService,
      providerService,
      sessionProductService,
      bookingService,
    } = getBookingServices();

    // 병렬로 통계 조회
    const [categoryCounts, providerCounts, productCounts, bookingCounts] =
      await Promise.all([
        categoryService.getCounts(),
        providerService.getCounts(),
        sessionProductService.getCounts(),
        bookingService.getBookingStatusCounts(),
      ]);

    return {
      totalCategories: categoryCounts.total,
      activeCategories: categoryCounts.active,
      totalProviders: providerCounts.total,
      activeProviders: providerCounts.active,
      pendingProviders: providerCounts.pending,
      totalProducts: productCounts.total,
      activeProducts: productCounts.active,
      totalBookings: bookingCounts.total,
      todayBookings: bookingCounts.today,
      pendingBookings: bookingCounts.pending,
      confirmedBookings: bookingCounts.confirmed,
      completedBookings: bookingCounts.completed,
      cancelledBookings: bookingCounts.cancelled,
      refundedBookings: bookingCounts.refunded,
      noShowBookings: bookingCounts.noShow,
      totalRevenue: bookingCounts.totalRevenue,
    };
  }),
});

export type BookingAdminRouterType = typeof bookingAdminRouter;
