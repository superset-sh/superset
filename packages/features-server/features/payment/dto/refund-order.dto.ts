import { z } from 'zod';

export const refundOrderSchema = z.object({
  amount: z.number().int().positive().optional().describe('Refund amount in cents (optional, defaults to full refund)'),
  reason: z.string().optional().describe('Refund reason'),
});

export type RefundOrderInput = z.infer<typeof refundOrderSchema>;
export type RefundOrderDto = RefundOrderInput;
