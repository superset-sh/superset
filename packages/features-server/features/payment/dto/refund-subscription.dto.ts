import { z } from 'zod';

export const refundSubscriptionSchema = z.object({
  reason: z.string().describe('Refund reason (required)'),
});

export type RefundSubscriptionInput = z.infer<typeof refundSubscriptionSchema>;
export type RefundSubscriptionDto = RefundSubscriptionInput;
