import { z } from "zod";

export const applyCouponSchema = z.object({
  code: z.string().min(1).describe("쿠폰 코드"),
  subscriptionId: z.string().uuid().describe("적용할 구독 ID"),
});

export type ApplyCouponDto = z.infer<typeof applyCouponSchema>;
