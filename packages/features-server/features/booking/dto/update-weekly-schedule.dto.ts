import { z } from "zod";

const weeklyScheduleItemSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6).describe("요일 (0=일 ~ 6=토)"),
  startTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:MM 형식이어야 합니다")
    .describe("시작 시간"),
  endTime: z
    .string()
    .regex(/^\d{2}:\d{2}$/, "HH:MM 형식이어야 합니다")
    .describe("종료 시간"),
  isActive: z.boolean().describe("활성 여부"),
});

export const updateWeeklyScheduleSchema = z.object({
  schedules: z
    .array(weeklyScheduleItemSchema)
    .min(1)
    .describe("주간 스케줄 배열"),
});

export type UpdateWeeklyScheduleDto = z.infer<
  typeof updateWeeklyScheduleSchema
>;
