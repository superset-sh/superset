import { z } from "zod";

export const createBookingSchema = z.object({
  providerId: z.string().uuid().describe("상담사 ID"),
  productId: z.string().uuid().describe("상품 ID"),
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
    .describe("상담 날짜"),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:MM 형식이어야 합니다")
    .describe("시작 시간"),
  consultationMode: z
    .enum(["online", "offline", "hybrid"])
    .describe("상담 방식"),
});

export type CreateBookingDto = z.infer<typeof createBookingSchema>;
