import { router, publicProcedure, protectedProcedure } from '../../../core/trpc';
import { TRPCError } from '@trpc/server';
import {
  createRoleInputSchema,
  updateRoleInputSchema,
  deleteRoleInputSchema,
  assignRolesInputSchema,
  removeRoleInputSchema,
  assignPermissionsInputSchema,
  removePermissionInputSchema,
  getPermissionsQuerySchema,
  getPermissionInputSchema,
  getRoleQuerySchema,
  getRolesQuerySchema,
  getUserRolesQuerySchema,
  getMyPermissionsQuerySchema,
  checkPermissionInputSchema,
} from '../dto';
import { requirePermission } from '../middleware';
import type { RoleService, PermissionService, AuthorizationService } from '../services';

// 서비스 인스턴스 (OnModuleInit에서 주입)
let roleService: RoleService;
let permissionService: PermissionService;
let authService: AuthorizationService;

export function injectRolePermissionServices(
  role: RoleService,
  permission: PermissionService,
  auth: AuthorizationService,
) {
  roleService = role;
  permissionService = permission;
  authService = auth;
}

/**
 * Role & Permission tRPC Router
 *
 * Provides API endpoints for role and permission management
 */
export const rolePermissionRouter = router({
  // ==================== PUBLIC PROCEDURES ====================

  /**
   * Get all permissions (public, for UI display)
   */
  permissions: router({
    list: publicProcedure.input(getPermissionsQuerySchema).query(async ({ input }) => {
      return permissionService.getPermissions(input);
    }),

    getById: publicProcedure.input(getPermissionInputSchema).query(async ({ input }) => {
      const permission = await permissionService.getPermissionById(input.id);

      if (!permission) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: `Permission with id "${input.id}" not found`,
        });
      }

      return permission;
    }),

    byCategory: publicProcedure.query(async () => {
      return permissionService.getPermissionsByCategory();
    }),
  }),

  // ==================== PROTECTED PROCEDURES (Authenticated Users) ====================

  /**
   * Get my roles and permissions
   */
  my: router({
    roles: protectedProcedure
      .input(getMyPermissionsQuerySchema)
      .query(async ({ ctx }) => {
        return authService.getUserRoles(ctx.user!.id);
      }),

    permissions: protectedProcedure
      .query(async ({ ctx }) => {
        return authService.getUserPermissions(ctx.user!.id);
      }),

    permissionSet: protectedProcedure
      .query(async ({ ctx }) => {
        return authService.getUserPermissionSet(ctx.user!.id);
      }),

    checkPermission: publicProcedure.input(checkPermissionInputSchema).query(async ({ ctx, input }) => {
      const userId = input.userId || ctx.user?.id;

      if (!userId) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'You must be logged in',
        });
      }

      return authService.checkPermissionDetailed(userId, input.permission as `${string}.${string}`);
    }),
  }),

  // ==================== ADMIN PROCEDURES (Role Management) ====================

  /**
   * Role management (Admin only)
   */
  roles: router({
    list: publicProcedure
      .use(requirePermission('roles.read'))
      .input(getRolesQuerySchema)
      .query(async ({ input }) => {
        return roleService.getRoles(input);
      }),

    getById: publicProcedure
      .use(requirePermission('roles.read'))
      .input(getRoleQuerySchema)
      .query(async ({ input }) => {
        if (input.includePermissions) {
          const role = await roleService.getRoleWithPermissions(input.id);
          if (!role) {
            throw new TRPCError({
              code: 'NOT_FOUND',
              message: `Role with id "${input.id}" not found`,
            });
          }
          return role;
        }

        const role = await roleService.getRoleById(input.id);
        if (!role) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: `Role with id "${input.id}" not found`,
          });
        }
        return role;
      }),

    create: publicProcedure
      .use(requirePermission('roles.create'))
      .input(createRoleInputSchema)
      .mutation(async ({ input }) => {
        return roleService.createRole(input);
      }),

    update: publicProcedure
      .use(requirePermission('roles.update'))
      .input(updateRoleInputSchema)
      .mutation(async ({ input }) => {
        return roleService.updateRole(input);
      }),

    delete: publicProcedure
      .use(requirePermission('roles.delete'))
      .input(deleteRoleInputSchema)
      .mutation(async ({ input }) => {
        await roleService.deleteRole(input.id);
        return { success: true, message: 'Role deleted successfully' };
      }),

    // Get permissions for a specific role
    permissions: publicProcedure
      .use(requirePermission('roles.read'))
      .input(getRoleQuerySchema)
      .query(async ({ input }) => {
        return roleService.getRolePermissions(input.id);
      }),

    // Assign permissions to a role
    assignPermissions: publicProcedure
      .use(requirePermission('roles.update'))
      .input(assignPermissionsInputSchema)
      .mutation(async ({ input }) => {
        await roleService.assignPermissionsToRole(input);

        return {
          success: true,
          roleId: input.roleId,
          assignedPermissions: input.permissionIds,
          message: 'Permissions assigned successfully',
        };
      }),

    // Remove permission from a role
    removePermission: publicProcedure
      .use(requirePermission('roles.update'))
      .input(removePermissionInputSchema)
      .mutation(async ({ input }) => {
        await roleService.removePermissionFromRole(input.roleId, input.permissionId);

        return {
          success: true,
          message: 'Permission removed successfully',
        };
      }),
  }),

  // ==================== USER ROLE ASSIGNMENT (Admin) ====================

  /**
   * User role assignment (Admin only)
   */
  userRoles: router({
    get: publicProcedure
      .use(requirePermission('roles.read'))
      .input(getUserRolesQuerySchema)
      .query(async ({ input }) => {
        const roles = await authService.getUserRoles(input.userId);

        if (input.includePermissions) {
          const permissions = await authService.getUserPermissions(input.userId);
          return { roles, permissions };
        }

        return { roles };
      }),

    assign: publicProcedure
      .use(requirePermission('roles.assign'))
      .input(assignRolesInputSchema)
      .mutation(async ({ ctx, input }) => {
        if (!ctx.user?.id) {
          throw new TRPCError({
            code: 'UNAUTHORIZED',
            message: 'You must be logged in',
          });
        }

        await authService.assignRolesToUser(
          input.userId,
          input.roleIds,
          ctx.user.id
        );

        return {
          success: true,
          userId: input.userId,
          assignedRoles: input.roleIds,
          message: 'Roles assigned successfully',
        };
      }),

    remove: publicProcedure
      .use(requirePermission('roles.assign'))
      .input(removeRoleInputSchema)
      .mutation(async ({ input }) => {
        await authService.removeRoleFromUser(input.userId, input.roleId);

        return {
          success: true,
          message: 'Role removed successfully',
        };
      }),
  }),

  // ==================== ADMIN UTILITIES ====================

  /**
   * Admin utilities (Super Admin only)
   */
  admin: router({
    seedRoles: publicProcedure
      .use(requirePermission('admin.settings'))
      .mutation(async () => {
        await roleService.seedSystemRoles();
        return { success: true, message: 'System roles seeded successfully' };
      }),

    seedPermissions: publicProcedure
      .use(requirePermission('admin.settings'))
      .mutation(async () => {
        await permissionService.seedSystemPermissions();
        return { success: true, message: 'System permissions seeded successfully' };
      }),

    clearCache: publicProcedure
      .use(requirePermission('admin.settings'))
      .mutation(async () => {
        authService.clearAllCaches();
        return { success: true, message: 'All permission caches cleared' };
      }),

    invalidateUserCache: publicProcedure
      .use(requirePermission('admin.settings'))
      .input(getUserRolesQuerySchema)
      .mutation(async ({ input }) => {
        authService.invalidateUserCache(input.userId);
        return { success: true, message: `Cache invalidated for user: ${input.userId}` };
      }),
  }),
});

export type RolePermissionRouter = typeof rolePermissionRouter;
