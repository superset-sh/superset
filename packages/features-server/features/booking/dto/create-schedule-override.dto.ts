import { z } from "zod";

export const createScheduleOverrideSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD 형식이어야 합니다")
    .describe("적용 날짜"),
  overrideType: z
    .enum(["unavailable", "available"])
    .describe("오버라이드 유형"),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:MM 형식이어야 합니다")
    .optional()
    .describe("시작 시간 (available 타입 시 필수)"),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:MM 형식이어야 합니다")
    .optional()
    .describe("종료 시간 (available 타입 시 필수)"),
  reason: z.string().optional().describe("사유"),
});

export type CreateScheduleOverrideDto = z.infer<
  typeof createScheduleOverrideSchema
>;
