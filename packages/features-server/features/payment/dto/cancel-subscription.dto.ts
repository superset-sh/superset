import { z } from 'zod';

export const cancelSubscriptionSchema = z.object({
  reason: z.string().optional().describe('Cancellation reason'),
});

export type CancelSubscriptionInput = z.infer<typeof cancelSubscriptionSchema>;
export type CancelSubscriptionDto = CancelSubscriptionInput;
