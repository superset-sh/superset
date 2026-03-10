import { z } from 'zod';

export const createCheckoutSchema = z.object({
  variantId: z.string().min(1).describe('Lemon Squeezy Variant ID'),
  customPrice: z.number().int().positive().optional().describe('Custom price in cents'),
  email: z.string().email().optional().describe('Customer email'),
  name: z.string().optional().describe('Customer name'),
  discountCode: z.string().optional().describe('Discount code'),
  customData: z.record(z.any()).optional().describe('Additional custom data'),
  redirectUrl: z.string().url().optional().describe('Redirect URL after checkout'),
});

export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;
export type CreateCheckoutDto = CreateCheckoutInput;
