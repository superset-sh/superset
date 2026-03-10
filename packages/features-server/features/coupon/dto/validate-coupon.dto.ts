import { z } from "zod";

export const validateCouponSchema = z.object({
  code: z.string().min(1).describe("쿠폰 코드"),
  planId: z.string().uuid().optional().describe("적용할 플랜 ID"),
});

export type ValidateCouponDto = z.infer<typeof validateCouponSchema>;
