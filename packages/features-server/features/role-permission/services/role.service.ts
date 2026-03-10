import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectDrizzle, type DrizzleDB } from '@superbuilder/drizzle';
import { eq, and, or, like, sql, type SQL } from 'drizzle-orm';
import { roles, rolePermissions, permissions, userRoles } from '@superbuilder/drizzle';
import type { Role, Permission } from '@superbuilder/drizzle';
import type {
  CreateRoleInput,
  UpdateRoleInput,
  GetRolesQuery,
  AssignPermissionsInput,
} from '../dto';
import type { RoleWithPermissions, SystemRole } from '../types';

/**
 * Role Service
 *
 * Handles role CRUD operations and role-permission mappings
 */
@Injectable()
export class RoleService {
  constructor(@InjectDrizzle() private readonly db: DrizzleDB) {}

  /**
   * Create a new role
   */
  async createRole(input: CreateRoleInput): Promise<Role> {
    // Check if role with same slug already exists
    const existingRole = await this.getRoleBySlug(input.slug);
    if (existingRole) {
      throw new BadRequestException(`Role with slug "${input.slug}" already exists`);
    }

    const [role] = await this.db
      .insert(roles)
      .values({
        name: input.name,
        slug: input.slug,
        description: input.description || null,
        color: input.color || null,
        icon: input.icon || null,
        priority: input.priority || 0,
        isSystem: false,
      })
      .returning();

    // Assign permissions if provided
    if (input.permissionIds && input.permissionIds.length > 0) {
      await this.assignPermissionsToRole({
        roleId: role!.id,
        permissionIds: input.permissionIds,
      });
    }

    return role!;
  }

  /**
   * Update an existing role
   */
  async updateRole(input: UpdateRoleInput): Promise<Role> {
    const role = await this.getRoleById(input.id);
    if (!role) {
      throw new NotFoundException(`Role with id "${input.id}" not found`);
    }

    // Prevent updating system roles
    if (role.isSystem) {
      throw new BadRequestException('Cannot update system roles');
    }

    // Check slug uniqueness if changing
    if (input.slug && input.slug !== role.slug) {
      const existingRole = await this.getRoleBySlug(input.slug);
      if (existingRole && existingRole.id !== role.id) {
        throw new BadRequestException(`Role with slug "${input.slug}" already exists`);
      }
    }

    const [updatedRole] = await this.db
      .update(roles)
      .set({
        ...(input.name && { name: input.name }),
        ...(input.slug && { slug: input.slug }),
        ...(input.description !== undefined && { description: input.description }),
        ...(input.color !== undefined && { color: input.color }),
        ...(input.icon !== undefined && { icon: input.icon }),
        ...(input.priority !== undefined && { priority: input.priority }),
        updatedAt: new Date(),
      })
      .where(eq(roles.id, input.id))
      .returning();

    return updatedRole!;
  }

  /**
   * Delete a role
   */
  async deleteRole(id: string): Promise<void> {
    const role = await this.getRoleById(id);
    if (!role) {
      throw new NotFoundException(`Role with id "${id}" not found`);
    }

    // Prevent deleting system roles
    if (role.isSystem) {
      throw new BadRequestException('Cannot delete system roles');
    }

    // Check if role is assigned to any users
    const userCount = await this.getRoleUserCount(id);
    if (userCount > 0) {
      throw new BadRequestException(
        `Cannot delete role "${role.name}" because it is assigned to ${userCount} user(s)`
      );
    }

    // Delete role (cascade will handle rolePermissions)
    await this.db.delete(roles).where(eq(roles.id, id));
  }

  /**
   * Get role by ID
   */
  async getRoleById(id: string): Promise<Role | null> {
    const [role] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);

    return role || null;
  }

  /**
   * Get role by slug
   */
  async getRoleBySlug(slug: string): Promise<Role | null> {
    const [role] = await this.db.select().from(roles).where(eq(roles.slug, slug)).limit(1);

    return role || null;
  }

  /**
   * Get all roles with optional filters
   */
  async getRoles(query: GetRolesQuery = {}): Promise<Role[]> {
    const conditions: SQL[] = [];

    if (query.isSystem !== undefined) {
      conditions.push(eq(roles.isSystem, query.isSystem));
    }

    if (query.search) {
      const searchPattern = `%${query.search}%`;
      const searchCondition = or(like(roles.name, searchPattern), like(roles.description, searchPattern));
      if (searchCondition) conditions.push(searchCondition);
    }

    const result = await this.db
      .select()
      .from(roles)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(roles.priority, roles.name);

    return result;
  }

  /**
   * Get role with permissions
   */
  async getRoleWithPermissions(roleId: string): Promise<RoleWithPermissions | null> {
    const role = await this.getRoleById(roleId);
    if (!role) {
      return null;
    }

    const rolePerms = await this.getRolePermissions(roleId);

    return {
      ...role,
      permissions: rolePerms,
      permissionCount: rolePerms.length,
    };
  }

  /**
   * Get permissions for a role
   */
  async getRolePermissions(roleId: string): Promise<Permission[]> {
    const result = await this.db
      .select({
        permission: permissions,
      })
      .from(rolePermissions)
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(rolePermissions.roleId, roleId));

    return result.map((r) => r.permission);
  }

  /**
   * Assign permissions to a role
   */
  async assignPermissionsToRole(input: AssignPermissionsInput): Promise<void> {
    const role = await this.getRoleById(input.roleId);
    if (!role) {
      throw new NotFoundException(`Role with id "${input.roleId}" not found`);
    }

    // Prevent modifying system role permissions
    if (role.isSystem) {
      throw new BadRequestException('Cannot modify permissions of system roles');
    }

    // Verify all permissions exist
    for (const permissionId of input.permissionIds) {
      const [permission] = await this.db
        .select()
        .from(permissions)
        .where(eq(permissions.id, permissionId))
        .limit(1);

      if (!permission) {
        throw new NotFoundException(`Permission with id "${permissionId}" not found`);
      }
    }

    // Insert role-permission mappings (skip if already exists)
    for (const permissionId of input.permissionIds) {
      const [existing] = await this.db
        .select()
        .from(rolePermissions)
        .where(
          and(eq(rolePermissions.roleId, input.roleId), eq(rolePermissions.permissionId, permissionId))
        )
        .limit(1);

      if (!existing) {
        await this.db.insert(rolePermissions).values({
          roleId: input.roleId,
          permissionId,
        });
      }
    }
  }

  /**
   * Remove a permission from a role
   */
  async removePermissionFromRole(roleId: string, permissionId: string): Promise<void> {
    const role = await this.getRoleById(roleId);
    if (!role) {
      throw new NotFoundException(`Role with id "${roleId}" not found`);
    }

    // Prevent modifying system role permissions
    if (role.isSystem) {
      throw new BadRequestException('Cannot modify permissions of system roles');
    }

    await this.db
      .delete(rolePermissions)
      .where(and(eq(rolePermissions.roleId, roleId), eq(rolePermissions.permissionId, permissionId)));
  }

  /**
   * Get number of users assigned to a role
   */
  async getRoleUserCount(roleId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(userRoles)
      .where(eq(userRoles.roleId, roleId));

    return Number(result[0]?.count || 0);
  }

  /**
   * Seed system roles
   * Called during initial setup or migration
   */
  async seedSystemRoles(): Promise<void> {
    const systemRoles: Array<{
      name: string;
      slug: SystemRole;
      description: string;
      priority: number;
      color: string;
      icon: string;
    }> = [
      {
        name: 'Owner',
        slug: 'owner' as SystemRole,
        description: '시스템 소유자 - 모든 권한 보유',
        priority: 100,
        color: '#EF4444',
        icon: 'shield-check',
      },
      {
        name: 'Admin',
        slug: 'admin' as SystemRole,
        description: '관리자 - 사용자/콘텐츠 관리 권한',
        priority: 80,
        color: '#F59E0B',
        icon: 'shield',
      },
      {
        name: 'Member',
        slug: 'member' as SystemRole,
        description: '일반 회원 - 기본 읽기/쓰기 권한',
        priority: 50,
        color: '#10B981',
        icon: 'user',
      },
      {
        name: 'Guest',
        slug: 'guest' as SystemRole,
        description: '게스트 - 로그인했지만 권한 없음',
        priority: 10,
        color: '#6B7280',
        icon: 'eye',
      },
    ];

    for (const roleData of systemRoles) {
      const existing = await this.getRoleBySlug(roleData.slug);
      if (!existing) {
        await this.db.insert(roles).values({
          ...roleData,
          isSystem: true,
        });
      }
    }
  }
}
