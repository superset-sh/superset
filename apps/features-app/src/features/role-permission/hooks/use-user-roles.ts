import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/**
 * Get user roles
 */
export function useUserRoles(userId: string, includePermissions = true) {
  const trpc = useTRPC();
  return useQuery(
    trpc.rolePermission.userRoles.get.queryOptions({
      userId,
      includePermissions,
    })
  );
}

/**
 * Hook with loading states
 */
export function useUserRolesWithLoading(userId: string, includePermissions = true) {
  const queryResult = useUserRoles(userId, includePermissions);

  return {
    roles: queryResult.data?.roles ?? [],
    permissions: 'permissions' in (queryResult.data ?? {}) ? (queryResult.data as any)?.permissions ?? [] : [],
    isLoading: queryResult.isLoading,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

/**
 * Assign roles to user mutation
 */
export function useAssignRolesToUser() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.rolePermission.userRoles.assign.mutationOptions(),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['rolePermission', 'userRoles', 'get', variables.userId],
      });
      queryClient.invalidateQueries({ queryKey: ['rolePermission', 'my'] });
    },
  });
}

/**
 * Remove role from user mutation
 */
export function useRemoveRoleFromUser() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  return useMutation({
    ...trpc.rolePermission.userRoles.remove.mutationOptions(),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ['rolePermission', 'userRoles', 'get', variables.userId],
      });
      queryClient.invalidateQueries({ queryKey: ['rolePermission', 'my'] });
    },
  });
}
