import { z } from 'zod';

/**
 * Update Role Input Schema
 */
export const updateRoleInputSchema = z.object({
  id: z.string().uuid(),
  name: z
    .string()
    .min(2, 'Role name must be at least 2 characters')
    .max(50, 'Role name must be at most 50 characters')
    .optional(),
  slug: z
    .string()
    .min(2, 'Role slug must be at least 2 characters')
    .max(50, 'Role slug must be at most 50 characters')
    .regex(/^[a-z0-9-]+$/, 'Role slug must be lowercase alphanumeric with hyphens')
    .optional(),
  description: z.string().max(500).nullable().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Color must be a valid hex color').nullable().optional(),
  icon: z.string().max(50).nullable().optional(),
  priority: z.number().int().min(0).max(100).optional(),
});

export type UpdateRoleInput = z.infer<typeof updateRoleInputSchema>;

/**
 * Update Role Output Schema
 */
export const updateRoleOutputSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  isSystem: z.boolean(),
  color: z.string().nullable(),
  icon: z.string().nullable(),
  priority: z.number(),
  updatedAt: z.date(),
});

export type UpdateRoleOutput = z.infer<typeof updateRoleOutputSchema>;

/**
 * Delete Role Input Schema
 */
export const deleteRoleInputSchema = z.object({
  id: z.string().uuid(),
});

export type DeleteRoleInput = z.infer<typeof deleteRoleInputSchema>;

/**
 * Delete Role Output Schema
 */
export const deleteRoleOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type DeleteRoleOutput = z.infer<typeof deleteRoleOutputSchema>;
