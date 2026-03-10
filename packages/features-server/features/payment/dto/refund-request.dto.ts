import { z } from "zod";

export const requestRefundSchema = z.object({
  orderId: z.string().uuid().describe("주문 ID"),
  reasonType: z.enum([
    "dissatisfied", "not_as_expected", "duplicate_payment",
    "changed_mind", "technical_issue", "other",
  ]).describe("환불 사유 유형"),
  reasonDetail: z.string().max(500).optional().describe("상세 사유"),
});

export const processRefundRequestSchema = z.object({
  requestId: z.string().uuid().describe("환불 요청 ID"),
  action: z.enum(["approve", "reject"]).describe("처리 액션"),
  adminNote: z.string().max(500).optional().describe("Admin 메모"),
});

export type RequestRefundInput = z.infer<typeof requestRefundSchema>;
export type ProcessRefundRequestInput = z.infer<typeof processRefundRequestSchema>;
