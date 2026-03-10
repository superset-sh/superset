import type { Permission, Role, UserRole } from '@superbuilder/drizzle';

/**
 * Role with associated permissions
 */
export interface RoleWithPermissions extends Role {
  permissions: Permission[];
  userCount?: number;
  permissionCount?: number;
}

/**
 * Role with user assignments
 */
export interface RoleWithUsers extends Role {
  users: UserRole[];
  userCount: number;
}

/**
 * User's role information
 */
export interface UserRoleInfo {
  userId: string;
  roles: Role[];
  permissions: Permission[];
}

/**
 * Role assignment result
 */
export interface RoleAssignmentResult {
  success: boolean;
  roleId: string;
  userId: string;
  message?: string;
  assignedAt: Date;
}

/**
 * Role statistics
 */
export interface RoleStats {
  totalRoles: number;
  systemRoles: number;
  customRoles: number;
  totalUsers: number;
  averagePermissionsPerRole: number;
}

/**
 * System role identifiers
 */
export enum SystemRole {
  OWNER = 'owner',
  ADMIN = 'admin',
  MEMBER = 'member',
  GUEST = 'guest',
}

/**
 * Role query filters
 */
export interface RoleQueryFilters {
  isSystem?: boolean;
  search?: string;
}

/**
 * Role with permission summary
 */
export interface RolePermissionSummary {
  roleId: string;
  roleName: string;
  permissionsByCategory: Record<string, Permission[]>;
  totalPermissions: number;
}
