import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, and, inArray } from 'drizzle-orm';
import { userRoles, roles, rolePermissions, permissions } from '@superbuilder/drizzle';
import type { Role, Permission } from '@superbuilder/drizzle';
import type {
  UserPermissionSet,
  PermissionCheck,
  ResourcePermissionContext,
  PermissionString,
} from '../types';

/**
 * Authorization Service
 *
 * Core service for permission checking and user authorization
 */
@Injectable()
export class AuthorizationService {
  private readonly logger = new Logger(AuthorizationService.name);
  private readonly cache = new Map<string, UserPermissionSet>();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * Check if user has a specific permission
   */
  async hasPermission(userId: string, permission: PermissionString): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);
    return this.checkPermission(userPermissions, permission);
  }

  /**
   * Check if user has a permission with detailed result
   */
  async checkPermissionDetailed(
    userId: string,
    permission: PermissionString
  ): Promise<PermissionCheck> {
    const userPermissions = await this.getUserPermissions(userId);
    const hasPermission = this.checkPermission(userPermissions, permission);

    return {
      hasPermission,
      reason: hasPermission
        ? 'User has required permission'
        : `User does not have permission: ${permission}`,
      checkedAt: new Date(),
    };
  }

  /**
   * Check if user has ALL of the specified permissions
   */
  async hasAllPermissions(userId: string, permissions: PermissionString[]): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);

    for (const permission of permissions) {
      if (!this.checkPermission(userPermissions, permission)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if user has ANY of the specified permissions
   */
  async hasAnyPermission(userId: string, permissions: PermissionString[]): Promise<boolean> {
    const userPermissions = await this.getUserPermissions(userId);

    for (const permission of permissions) {
      if (this.checkPermission(userPermissions, permission)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user can access a specific resource
   * Handles "own" vs "all" scope
   */
  async canAccessResource(context: ResourcePermissionContext): Promise<boolean> {
    const { userId, resource, action, resourceOwnerId } = context;

    // Build permission strings to check
    const allPermission: PermissionString = `${resource}.${action}.all`;
    const ownPermission: PermissionString = `${resource}.${action}.own`;
    const basicPermission: PermissionString = `${resource}.${action}`;

    // Check if user has "all" scope permission
    if (await this.hasPermission(userId, allPermission)) {
      return true;
    }

    // Check if user has "own" scope permission and owns the resource
    if (resourceOwnerId && userId === resourceOwnerId) {
      if (await this.hasPermission(userId, ownPermission)) {
        return true;
      }
    }

    // Check basic permission (no scope)
    if (await this.hasPermission(userId, basicPermission)) {
      return true;
    }

    return false;
  }

  /**
   * Get all roles for a user
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    // Check cache first
    const cached = this.getFromCache(userId);
    if (cached) {
      return cached.roles;
    }

    const result = await this.db
      .select({
        role: roles,
      })
      .from(userRoles)
      .innerJoin(roles, eq(userRoles.roleId, roles.id))
      .where(eq(userRoles.userId, userId));

    return result.map((r) => r.role);
  }

  /**
   * Get all permissions for a user (union of all role permissions)
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    // Check cache first
    const cached = this.getFromCache(userId);
    if (cached) {
      return cached.permissions;
    }

    const userRolesList = await this.getUserRoles(userId);

    if (userRolesList.length === 0) {
      return [];
    }

    const roleIds = userRolesList.map((r) => r.id);

    const result = await this.db
      .select({
        permission: permissions,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(inArray(rolePermissions.roleId, roleIds));

    // Deduplicate permissions by ID
    const uniquePermissions = Array.from(
      new Map(result.map((r) => [r.permission.id, r.permission])).values()
    );

    // Update cache
    this.setCache(userId, {
      userId,
      roles: userRolesList,
      permissions: uniquePermissions,
      cachedAt: new Date(),
    });

    return uniquePermissions;
  }

  /**
   * Get complete permission set for a user
   */
  async getUserPermissionSet(userId: string): Promise<UserPermissionSet> {
    const roles = await this.getUserRoles(userId);
    const permissions = await this.getUserPermissions(userId);

    return {
      userId,
      roles,
      permissions,
      cachedAt: new Date(),
    };
  }

  /**
   * Assign roles to a user
   */
  async assignRolesToUser(
    userId: string,
    roleIds: string[],
    assignedBy: string
  ): Promise<void> {
    // Verify all roles exist
    for (const roleId of roleIds) {
      const [role] = await this.db.select().from(roles).where(eq(roles.id, roleId)).limit(1);

      if (!role) {
        throw new NotFoundException(`역할을 찾을 수 없습니다: ${roleId}`);
      }
    }

    // Insert user-role mappings (skip if already exists)
    for (const roleId of roleIds) {
      const [existing] = await this.db
        .select()
        .from(userRoles)
        .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
        .limit(1);

      if (!existing) {
        await this.db.insert(userRoles).values({
          userId,
          roleId,
          assignedBy,
        });
      }
    }

    // Invalidate user cache
    this.invalidateUserCache(userId);
  }

  /**
   * Remove a role from a user
   */
  async removeRoleFromUser(
    userId: string,
    roleId: string
  ): Promise<void> {
    await this.db
      .delete(userRoles)
      .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)));

    // Invalidate user cache
    this.invalidateUserCache(userId);
  }

  /**
   * Invalidate user permission cache
   */
  invalidateUserCache(userId: string): void {
    this.cache.delete(userId);
    this.logger.debug(`Cache invalidated for user: ${userId}`);
  }

  /**
   * Clear all permission caches
   */
  clearAllCaches(): void {
    this.cache.clear();
    this.logger.debug('All permission caches cleared');
  }

  /**
   * Check permission against user's permission list
   * @private
   */
  private checkPermission(userPermissions: Permission[], requiredPermission: PermissionString): boolean {
    const [resource, action, scope] = requiredPermission.split('.');

    for (const permission of userPermissions) {
      // Exact match
      if (
        permission.resource === resource &&
        permission.action === action &&
        (scope === undefined || permission.scope === scope)
      ) {
        return true;
      }

      // "all" scope implies "own" scope
      if (
        permission.resource === resource &&
        permission.action === action &&
        permission.scope === 'all' &&
        scope === 'own'
      ) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get from cache
   * @private
   */
  private getFromCache(userId: string): UserPermissionSet | null {
    const cached = this.cache.get(userId);

    if (!cached) {
      return null;
    }

    // Check if cache is expired
    const now = Date.now();
    const cacheAge = now - cached.cachedAt.getTime();

    if (cacheAge > this.CACHE_TTL) {
      this.cache.delete(userId);
      return null;
    }

    return cached;
  }

  /**
   * Set cache
   * @private
   */
  private setCache(userId: string, permissionSet: UserPermissionSet): void {
    this.cache.set(userId, permissionSet);
    this.logger.debug(`Cache set for user: ${userId}`);
  }
}
