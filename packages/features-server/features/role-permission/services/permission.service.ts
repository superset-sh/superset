import { Injectable } from '@nestjs/common';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, and, or, like, type SQL } from 'drizzle-orm';
import { permissions } from '@superbuilder/drizzle';
import type { Permission } from '@superbuilder/drizzle';
import type { GetPermissionsQuery } from '../dto';
import { PermissionCategory } from '../types';

/**
 * Permission Service
 *
 * Handles permission queries and management
 */
@Injectable()
export class PermissionService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * Get all permissions with optional filters
   */
  async getPermissions(query: GetPermissionsQuery = {}): Promise<Permission[]> {
    const conditions: SQL[] = [];

    if (query.resource) {
      conditions.push(eq(permissions.resource, query.resource));
    }

    if (query.action) {
      conditions.push(eq(permissions.action, query.action));
    }

    if (query.scope) {
      conditions.push(eq(permissions.scope, query.scope));
    }

    if (query.category) {
      conditions.push(eq(permissions.category, query.category));
    }

    if (query.search) {
      const searchPattern = `%${query.search}%`;
      const searchCondition = or(
        like(permissions.resource, searchPattern),
        like(permissions.action, searchPattern),
        like(permissions.description, searchPattern)
      );
      if (searchCondition) conditions.push(searchCondition);
    }

    const result = await this.db
      .select()
      .from(permissions)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(permissions.category, permissions.resource, permissions.action);

    return result;
  }

  /**
   * Get permission by ID
   */
  async getPermissionById(id: string): Promise<Permission | null> {
    const result = await this.db
      .select()
      .from(permissions)
      .where(eq(permissions.id, id))
      .limit(1);

    return result[0] || null;
  }

  /**
   * Get permissions grouped by category
   */
  async getPermissionsByCategory(): Promise<Record<string, Permission[]>> {
    const allPermissions = await this.getPermissions();

    const grouped: Record<string, Permission[]> = {};

    for (const permission of allPermissions) {
      const category = permission.category || 'uncategorized';
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(permission);
    }

    return grouped;
  }

  /**
   * Check if permission exists
   */
  async permissionExists(resource: string, action: string, scope?: string | null): Promise<boolean> {
    const conditions = [eq(permissions.resource, resource), eq(permissions.action, action)];

    if (scope) {
      conditions.push(eq(permissions.scope, scope));
    }

    const result = await this.db
      .select({ id: permissions.id })
      .from(permissions)
      .where(and(...conditions))
      .limit(1);

    return result.length > 0;
  }

  /**
   * Seed system permissions
   * Called during initial setup or migration
   */
  async seedSystemPermissions(): Promise<void> {
    const systemPermissions = [
      // Posts permissions
      {
        resource: 'posts',
        action: 'create',
        scope: null,
        description: 'Create new posts',
        category: PermissionCategory.POSTS,
      },
      {
        resource: 'posts',
        action: 'read',
        scope: null,
        description: 'View posts',
        category: PermissionCategory.POSTS,
      },
      {
        resource: 'posts',
        action: 'update',
        scope: 'own',
        description: 'Update own posts',
        category: PermissionCategory.POSTS,
      },
      {
        resource: 'posts',
        action: 'update',
        scope: 'all',
        description: 'Update any posts',
        category: PermissionCategory.POSTS,
      },
      {
        resource: 'posts',
        action: 'delete',
        scope: 'own',
        description: 'Delete own posts',
        category: PermissionCategory.POSTS,
      },
      {
        resource: 'posts',
        action: 'delete',
        scope: 'all',
        description: 'Delete any posts',
        category: PermissionCategory.POSTS,
      },

      // Comments permissions
      {
        resource: 'comments',
        action: 'create',
        scope: null,
        description: 'Create comments',
        category: PermissionCategory.COMMENTS,
      },
      {
        resource: 'comments',
        action: 'read',
        scope: null,
        description: 'View comments',
        category: PermissionCategory.COMMENTS,
      },
      {
        resource: 'comments',
        action: 'update',
        scope: 'own',
        description: 'Update own comments',
        category: PermissionCategory.COMMENTS,
      },
      {
        resource: 'comments',
        action: 'update',
        scope: 'all',
        description: 'Update any comments',
        category: PermissionCategory.COMMENTS,
      },
      {
        resource: 'comments',
        action: 'delete',
        scope: 'own',
        description: 'Delete own comments',
        category: PermissionCategory.COMMENTS,
      },
      {
        resource: 'comments',
        action: 'delete',
        scope: 'all',
        description: 'Delete any comments',
        category: PermissionCategory.COMMENTS,
      },

      // Users permissions
      {
        resource: 'users',
        action: 'read',
        scope: null,
        description: 'View user profiles',
        category: PermissionCategory.USERS,
      },
      {
        resource: 'users',
        action: 'update',
        scope: 'own',
        description: 'Update own profile',
        category: PermissionCategory.USERS,
      },
      {
        resource: 'users',
        action: 'update',
        scope: 'all',
        description: 'Update any user profile',
        category: PermissionCategory.USERS,
      },
      {
        resource: 'users',
        action: 'delete',
        scope: 'all',
        description: 'Delete users',
        category: PermissionCategory.USERS,
      },
      {
        resource: 'users',
        action: 'ban',
        scope: null,
        description: 'Ban users',
        category: PermissionCategory.USERS,
      },

      // Roles permissions
      {
        resource: 'roles',
        action: 'create',
        scope: null,
        description: 'Create roles',
        category: PermissionCategory.ROLES,
      },
      {
        resource: 'roles',
        action: 'read',
        scope: null,
        description: 'View roles',
        category: PermissionCategory.ROLES,
      },
      {
        resource: 'roles',
        action: 'update',
        scope: null,
        description: 'Update roles',
        category: PermissionCategory.ROLES,
      },
      {
        resource: 'roles',
        action: 'delete',
        scope: null,
        description: 'Delete roles',
        category: PermissionCategory.ROLES,
      },
      {
        resource: 'roles',
        action: 'assign',
        scope: null,
        description: 'Assign roles to users',
        category: PermissionCategory.ROLES,
      },

      // Files permissions
      {
        resource: 'files',
        action: 'upload',
        scope: null,
        description: 'Upload files',
        category: PermissionCategory.FILES,
      },
      {
        resource: 'files',
        action: 'read',
        scope: null,
        description: 'View files',
        category: PermissionCategory.FILES,
      },
      {
        resource: 'files',
        action: 'delete',
        scope: 'own',
        description: 'Delete own files',
        category: PermissionCategory.FILES,
      },
      {
        resource: 'files',
        action: 'delete',
        scope: 'all',
        description: 'Delete any files',
        category: PermissionCategory.FILES,
      },

      // Admin permissions
      {
        resource: 'admin',
        action: 'access',
        scope: null,
        description: 'Access admin panel',
        category: PermissionCategory.ADMIN,
      },
      {
        resource: 'admin',
        action: 'settings',
        scope: null,
        description: 'Manage system settings',
        category: PermissionCategory.ADMIN,
      },
    ];

    // Insert permissions, skip if already exists
    for (const permission of systemPermissions) {
      const exists = await this.permissionExists(
        permission.resource,
        permission.action,
        permission.scope
      );

      if (!exists) {
        await this.db.insert(permissions).values(permission);
      }
    }
  }
}
