import { z } from "zod";

export const bookingQuerySchema = z.object({
  status: z
    .enum([
      "pending_payment",
      "confirmed",
      "completed",
      "no_show",
      "cancelled_by_user",
      "cancelled_by_provider",
      "refunded",
      "expired",
    ])
    .optional()
    .describe("예약 상태 필터"),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
    .optional()
    .describe("시작 날짜"),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
    .optional()
    .describe("종료 날짜"),
  page: z.number().int().min(1).default(1).describe("페이지 번호"),
  limit: z.number().int().min(1).max(100).default(20).describe("페이지 크기"),
});

export type BookingQueryDto = z.infer<typeof bookingQuerySchema>;
