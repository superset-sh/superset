import { z } from 'zod';

export const updateSubscriptionSchema = z.object({
  variantId: z.string().optional().describe('New variant ID to switch plan'),
  pause: z.boolean().optional().describe('Pause subscription'),
  invoiceImmediately: z.boolean().optional().describe('Invoice immediately on change'),
});

export type UpdateSubscriptionInput = z.infer<typeof updateSubscriptionSchema>;
export type UpdateSubscriptionDto = UpdateSubscriptionInput;
