import type { Permission, Role } from '@superbuilder/drizzle';

/**
 * Permission check result
 */
export interface PermissionCheck {
  hasPermission: boolean;
  reason?: string;
  checkedAt: Date;
}

/**
 * User's complete permission set (for caching)
 */
export interface UserPermissionSet {
  userId: string;
  roles: Role[];
  permissions: Permission[];
  cachedAt: Date;
}

/**
 * Permission string format: {resource}.{action}.{scope?}
 * Examples:
 * - "posts.create"
 * - "posts.update.own"
 * - "posts.update.all"
 * - "users.delete"
 */
export type PermissionString = `${string}.${string}` | `${string}.${string}.${string}`;

/**
 * Resource-level permission check context
 */
export interface ResourcePermissionContext {
  userId: string;
  resource: string;
  action: string;
  resourceOwnerId?: string;
}

/**
 * Permission categories for UI grouping
 */
export enum PermissionCategory {
  POSTS = 'posts',
  USERS = 'users',
  ROLES = 'roles',
  COMMENTS = 'comments',
  FILES = 'files',
  ADMIN = 'admin',
  SYSTEM = 'system',
}

/**
 * Permission scope
 */
export enum PermissionScope {
  OWN = 'own',
  ALL = 'all',
}

/**
 * Permission with metadata
 */
export interface PermissionWithMetadata extends Permission {
  roleCount?: number;
  userCount?: number;
}

/**
 * Permission query filters
 */
export interface PermissionQueryFilters {
  resource?: string;
  action?: string;
  scope?: string;
  category?: PermissionCategory;
}
