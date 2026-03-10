import { z } from 'zod';

// ========== Pagination Base ==========

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(10),
});

// ========== Subscription Query ==========

export const subscriptionQuerySchema = paginationSchema.extend({
  status: z
    .enum(['all', 'active', 'cancelled', 'expired', 'paused', 'on_trial'])
    .default('all'),
  userId: z.string().uuid().optional(),
});

export type SubscriptionQueryInput = z.infer<typeof subscriptionQuerySchema>;
export type SubscriptionQueryDto = SubscriptionQueryInput;

// ========== Order Query ==========

export const orderQuerySchema = paginationSchema.extend({
  status: z.enum(['all', 'pending', 'paid', 'refunded']).default('all'),
  userId: z.string().uuid().optional(),
});

export type OrderQueryInput = z.infer<typeof orderQuerySchema>;
export type OrderQueryDto = OrderQueryInput;

// ========== License Query ==========

export const licenseQuerySchema = paginationSchema.extend({
  status: z.enum(['all', 'active', 'inactive', 'expired', 'disabled']).default('all'),
  userId: z.string().uuid().optional(),
});

export type LicenseQueryInput = z.infer<typeof licenseQuerySchema>;
export type LicenseQueryDto = LicenseQueryInput;
