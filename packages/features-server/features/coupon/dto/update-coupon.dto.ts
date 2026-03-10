import { z } from "zod";

export const updateCouponSchema = z.object({
  name: z.string().min(1).max(100).optional().describe("관리용 이름"),
  description: z.string().max(500).optional().describe("쿠폰 설명"),
  maxRedemptions: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe("최대 사용 횟수"),
  expiresAt: z.string().datetime().optional().describe("만료일"),
  isActive: z.boolean().optional().describe("활성 여부"),
});

export type UpdateCouponDto = z.infer<typeof updateCouponSchema>;
