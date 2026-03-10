import { z } from "zod";

const refundRuleSchema = z.object({
  hours_before: z.number().int().min(0).describe("상담 시작 전 시간"),
  refund_percentage: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("환불 비율 (%)"),
});

export const updateRefundPolicySchema = z.object({
  name: z.string().min(1).max(200).describe("정책명"),
  rules: z
    .array(refundRuleSchema)
    .min(1)
    .describe("시간대별 환불 규칙"),
  noShowRefundPercentage: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("노쇼 시 환불 비율 (%)"),
  providerCancelRefundPercentage: z
    .number()
    .int()
    .min(0)
    .max(100)
    .describe("상담사 취소 시 환불 비율 (%)"),
  isActive: z.boolean().optional().describe("활성 여부"),
});

export type UpdateRefundPolicyDto = z.infer<typeof updateRefundPolicySchema>;
