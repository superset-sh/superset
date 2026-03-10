import { z } from 'zod';

/**
 * Get Permissions Query Schema
 */
export const getPermissionsQuerySchema = z.object({
  resource: z.string().optional(),
  action: z.string().optional(),
  scope: z.string().optional(),
  category: z.string().optional(),
  search: z.string().optional(),
});

export type GetPermissionsQuery = z.infer<typeof getPermissionsQuerySchema>;

/**
 * Get Permission by ID Input Schema
 */
export const getPermissionInputSchema = z.object({
  id: z.string().uuid(),
});

export type GetPermissionInput = z.infer<typeof getPermissionInputSchema>;

/**
 * Get Role Query Schema
 */
export const getRoleQuerySchema = z.object({
  id: z.string().uuid(),
  includePermissions: z.boolean().default(false),
  includeUsers: z.boolean().default(false),
});

export type GetRoleQuery = z.infer<typeof getRoleQuerySchema>;

/**
 * Get Roles Query Schema
 */
export const getRolesQuerySchema = z.object({
  isSystem: z.boolean().optional(),
  search: z.string().optional(),
  includePermissions: z.boolean().optional().default(false),
});

export type GetRolesQuery = z.input<typeof getRolesQuerySchema>;

/**
 * Get User Roles Query Schema
 */
export const getUserRolesQuerySchema = z.object({
  userId: z.string().uuid(),
  includePermissions: z.boolean().default(true),
});

export type GetUserRolesQuery = z.infer<typeof getUserRolesQuerySchema>;

/**
 * Get My Permissions Query Schema
 */
export const getMyPermissionsQuerySchema = z.object({});

export type GetMyPermissionsQuery = z.infer<typeof getMyPermissionsQuerySchema>;

/**
 * Check Permission Input Schema
 */
export const checkPermissionInputSchema = z.object({
  permission: z
    .string()
    .regex(
      /^[a-z]+\.[a-z]+(\.[a-z]+)?$/,
      'Permission must be in format: resource.action or resource.action.scope'
    ),
  userId: z.string().uuid().optional(), // If not provided, use current user
  resourceOwnerId: z.string().uuid().optional(), // For "own" scope checks
});

export type CheckPermissionInput = z.infer<typeof checkPermissionInputSchema>;

/**
 * Check Permission Output Schema
 */
export const checkPermissionOutputSchema = z.object({
  hasPermission: z.boolean(),
  reason: z.string().optional(),
  checkedAt: z.date(),
});

export type CheckPermissionOutput = z.infer<typeof checkPermissionOutputSchema>;
