import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

/**
 * Get all permissions
 */
export function usePermissions(query?: { resource?: string; action?: string; scope?: string; category?: string; search?: string }) {
  const trpc = useTRPC();
  return useQuery(trpc.rolePermission.permissions.list.queryOptions(query ?? {}));
}

/**
 * Get permission by ID
 */
export function usePermission(permissionId: string) {
  const trpc = useTRPC();
  return useQuery(trpc.rolePermission.permissions.getById.queryOptions({ id: permissionId }));
}

/**
 * Get permissions grouped by category
 */
export function usePermissionsByCategory() {
  const trpc = useTRPC();
  return useQuery(trpc.rolePermission.permissions.byCategory.queryOptions());
}

/**
 * Hook with loading states
 */
export function usePermissionsWithLoading(query?: { resource?: string; action?: string; scope?: string; category?: string; search?: string }) {
  const queryResult = usePermissions(query ?? {});

  return {
    permissions: queryResult.data ?? [],
    isLoading: queryResult.isLoading,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

/**
 * Hook for permissions by category with loading states
 */
export function usePermissionsByCategoryWithLoading() {
  const queryResult = usePermissionsByCategory();

  return {
    permissionsByCategory: queryResult.data ?? {},
    isLoading: queryResult.isLoading,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}
