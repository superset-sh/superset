import { z } from 'zod';

/**
 * Assign Roles to User Input Schema
 */
export const assignRolesInputSchema = z.object({
  userId: z.string().uuid(),
  roleIds: z.array(z.string().uuid()).min(1, 'At least one role is required'),
  expiresAt: z.date().optional(),
});

export type AssignRolesInput = z.infer<typeof assignRolesInputSchema>;

/**
 * Assign Roles to User Output Schema
 */
export const assignRolesOutputSchema = z.object({
  success: z.boolean(),
  userId: z.string().uuid(),
  assignedRoles: z.array(z.string()),
  message: z.string(),
});

export type AssignRolesOutput = z.infer<typeof assignRolesOutputSchema>;

/**
 * Remove Role from User Input Schema
 */
export const removeRoleInputSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});

export type RemoveRoleInput = z.infer<typeof removeRoleInputSchema>;

/**
 * Remove Role from User Output Schema
 */
export const removeRoleOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type RemoveRoleOutput = z.infer<typeof removeRoleOutputSchema>;

/**
 * Assign Permissions to Role Input Schema
 */
export const assignPermissionsInputSchema = z.object({
  roleId: z.string().uuid(),
  permissionIds: z.array(z.string().uuid()).min(1, 'At least one permission is required'),
});

export type AssignPermissionsInput = z.infer<typeof assignPermissionsInputSchema>;

/**
 * Assign Permissions to Role Output Schema
 */
export const assignPermissionsOutputSchema = z.object({
  success: z.boolean(),
  roleId: z.string().uuid(),
  assignedPermissions: z.array(z.string()),
  message: z.string(),
});

export type AssignPermissionsOutput = z.infer<typeof assignPermissionsOutputSchema>;

/**
 * Remove Permission from Role Input Schema
 */
export const removePermissionInputSchema = z.object({
  roleId: z.string().uuid(),
  permissionId: z.string().uuid(),
});

export type RemovePermissionInput = z.infer<typeof removePermissionInputSchema>;

/**
 * Remove Permission from Role Output Schema
 */
export const removePermissionOutputSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

export type RemovePermissionOutput = z.infer<typeof removePermissionOutputSchema>;
