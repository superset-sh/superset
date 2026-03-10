import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/**
 * Get all roles
 */
export function useRoles(query?: { isSystem?: boolean; search?: string; includePermissions?: boolean }) {
  const trpc = useTRPC();
  return useQuery(trpc.rolePermission.roles.list.queryOptions(query ?? {}));
}

/**
 * Get role by ID
 */
export function useRole(roleId: string, includePermissions = false) {
  const trpc = useTRPC();
  return useQuery(
    trpc.rolePermission.roles.getById.queryOptions({
      id: roleId,
      includePermissions,
      includeUsers: false,
    })
  );
}

/**
 * Get role with permissions
 */
export function useRoleWithPermissions(roleId: string) {
  return useRole(roleId, true);
}

/**
 * Create role mutation
 */
export function useCreateRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.rolePermission.roles.create.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rolePermission', 'roles', 'list'] });
    },
  });
}

/**
 * Update role mutation
 */
export function useUpdateRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.rolePermission.roles.update.mutationOptions(),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['rolePermission', 'roles', 'getById', variables.id] });
      queryClient.invalidateQueries({ queryKey: ['rolePermission', 'roles', 'list'] });
    },
  });
}

/**
 * Delete role mutation
 */
export function useDeleteRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.rolePermission.roles.delete.mutationOptions(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rolePermission', 'roles', 'list'] });
    },
  });
}

/**
 * Assign permissions to role mutation
 */
export function useAssignPermissionsToRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.rolePermission.roles.assignPermissions.mutationOptions(),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['rolePermission', 'roles', 'getById', variables.roleId],
      });
      queryClient.invalidateQueries({
        queryKey: ['rolePermission', 'roles', 'permissions', variables.roleId],
      });
    },
  });
}

/**
 * Remove permission from role mutation
 */
export function useRemovePermissionFromRole() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.rolePermission.roles.removePermission.mutationOptions(),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['rolePermission', 'roles', 'getById', variables.roleId],
      });
      queryClient.invalidateQueries({
        queryKey: ['rolePermission', 'roles', 'permissions', variables.roleId],
      });
    },
  });
}
