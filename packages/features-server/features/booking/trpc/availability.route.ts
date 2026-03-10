/**
 * Booking Availability tRPC Router
 *
 * 상담사 가용시간 관리 및 슬롯 조회 프로시저
 */
import { z } from "zod";
import {
  router,
  publicProcedure,
  authProcedure,
} from "../../../core/trpc";
import {
  updateWeeklyScheduleSchema,
  createScheduleOverrideSchema,
} from "../dto";
import { getBookingServices } from "./index";

// ============================================================================
// Router
// ============================================================================

export const availabilityRouter = router({
  // ==========================================================================
  // Public Procedures
  // ==========================================================================

  /**
   * 특정 날짜의 가용 슬롯 조회
   */
  slots: publicProcedure
    .input(
      z.object({
        providerId: z.string().uuid().describe("상담사 ID"),
        date: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
          .describe("조회 날짜"),
        durationMinutes: z
          .number()
          .int()
          .min(15)
          .max(480)
          .describe("상담 시간 (분)"),
      }),
    )
    .query(async ({ input }) => {
      const { availabilityService } = getBookingServices();
      return availabilityService.getAvailableSlots(
        input.providerId,
        input.date,
        input.durationMinutes,
      );
    }),

  // ==========================================================================
  // Auth Procedures (상담사 스케줄 관리)
  // ==========================================================================

  /**
   * 상담사의 주간 스케줄 조회
   */
  weeklySchedule: authProcedure
    .input(z.string().uuid().describe("상담사 ID"))
    .query(async ({ input }) => {
      const { availabilityService } = getBookingServices();
      return availabilityService.getWeeklySchedule(input);
    }),

  /**
   * 주간 스케줄 배치 업데이트
   */
  updateSchedule: authProcedure
    .input(
      z.object({
        providerId: z.string().uuid().describe("상담사 ID"),
        schedules: updateWeeklyScheduleSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const { availabilityService } = getBookingServices();
      return availabilityService.updateWeeklySchedule(
        input.providerId,
        input.schedules,
      );
    }),

  /**
   * 기간 내 스케줄 오버라이드 조회
   */
  overrides: authProcedure
    .input(
      z.object({
        providerId: z.string().uuid().describe("상담사 ID"),
        dateFrom: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
          .describe("시작 날짜"),
        dateTo: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
          .describe("종료 날짜"),
      }),
    )
    .query(async ({ input }) => {
      const { availabilityService } = getBookingServices();
      return availabilityService.getOverrides(
        input.providerId,
        input.dateFrom,
        input.dateTo,
      );
    }),

  /**
   * 스케줄 오버라이드 생성
   */
  createOverride: authProcedure
    .input(
      z.object({
        providerId: z.string().uuid().describe("상담사 ID"),
        override: createScheduleOverrideSchema,
      }),
    )
    .mutation(async ({ input }) => {
      const { availabilityService } = getBookingServices();
      return availabilityService.createOverride(
        input.providerId,
        input.override,
      );
    }),

  /**
   * 스케줄 오버라이드 삭제
   */
  deleteOverride: authProcedure
    .input(
      z.object({
        overrideId: z.string().uuid().describe("오버라이드 ID"),
        providerId: z.string().uuid().describe("상담사 ID"),
      }),
    )
    .mutation(async ({ input }) => {
      const { availabilityService } = getBookingServices();
      return availabilityService.deleteOverride(
        input.overrideId,
        input.providerId,
      );
    }),
});

export type AvailabilityRouterType = typeof availabilityRouter;
