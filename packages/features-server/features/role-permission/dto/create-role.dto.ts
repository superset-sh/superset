import { z } from 'zod';

/**
 * Create Role Input Schema
 */
export const createRoleInputSchema = z.object({
  name: z
    .string()
    .min(2, 'Role name must be at least 2 characters')
    .max(50, 'Role name must be at most 50 characters'),
  slug: z
    .string()
    .min(2, 'Role slug must be at least 2 characters')
    .max(50, 'Role slug must be at most 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Role slug must be lowercase alphanumeric with hyphens'),
  description: z.string().max(500).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').optional(),
  icon: z.string().max(50).optional(),
  priority: z.number().int().min(0).max(100).default(0),
  permissionIds: z.array(z.string().uuid()).optional(),
});

export type CreateRoleInput = z.infer<typeof createRoleInputSchema>;

/**
 * Create Role Output Schema
 */
export const createRoleOutputSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  priority: z.number(),
  createdAt: z.date(),
  updatedAt: z.date(),
  permissionCount: z.number().optional(),
});

export type CreateRoleOutput = z.infer<typeof createRoleOutputSchema>;
