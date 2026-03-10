import { z } from "zod";

export const createCouponSchema = z.object({
  code: z
    .string()
    .min(1)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, "코드는 영문 대문자, 숫자, -, _ 만 허용")
    .describe("쿠폰 코드"),
  name: z.string().min(1).max(100).describe("관리용 이름"),
  description: z.string().max(500).optional().describe("쿠폰 설명"),
  discountPercent: z
    .number()
    .int()
    .min(1)
    .max(100)
    .describe("할인율 (1~100%)"),
  durationMonths: z
    .number()
    .int()
    .min(1)
    .max(36)
    .describe("할인 적용 기간 (개월)"),
  applicablePlans: z
    .array(z.string())
    .optional()
    .describe("적용 가능 플랜 ID 목록, null이면 전체"),
  maxRedemptions: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("최대 사용 횟수, null이면 무제한"),
  startsAt: z.string().datetime().describe("유효 시작일"),
  expiresAt: z.string().datetime().optional().describe("만료일"),
});

export type CreateCouponDto = z.infer<typeof createCouponSchema>;
