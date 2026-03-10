import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc';

type PermissionString = `${string}.${string}` | `${string}.${string}.${string}`;

/**
 * Get current user's roles
 */
export function useMyRoles() {
  const trpc = useTRPC();
  return useQuery(trpc.rolePermission.my.roles.queryOptions({}));
}

/**
 * Get current user's permissions
 */
export function useMyPermissions() {
  const trpc = useTRPC();
  return useQuery(trpc.rolePermission.my.permissions.queryOptions());
}

/**
 * Get current user's complete permission set
 */
export function useMyPermissionSet() {
  const trpc = useTRPC();
  return useQuery(trpc.rolePermission.my.permissionSet.queryOptions());
}

/**
 * Check if current user has a specific permission
 */
export function useHasPermission(permission: PermissionString, resourceOwnerId?: string) {
  const trpc = useTRPC();
  return useQuery(
    trpc.rolePermission.my.checkPermission.queryOptions({
      permission,
      resourceOwnerId,
    })
  );
}

/**
 * Hook to check permission with boolean result
 */
export function useCanAccess(permission: PermissionString, resourceOwnerId?: string) {
  const query = useHasPermission(permission, resourceOwnerId);
  return {
    canAccess: query.data?.hasPermission ?? false,
    isLoading: query.isLoading,
    reason: query.data?.reason,
  };
}

/**
 * Hook with loading states for my roles
 */
export function useMyRolesWithLoading() {
  const queryResult = useMyRoles();

  return {
    roles: queryResult.data ?? [],
    isLoading: queryResult.isLoading,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

/**
 * Hook with loading states for my permissions
 */
export function useMyPermissionsWithLoading() {
  const queryResult = useMyPermissions();

  return {
    permissions: queryResult.data ?? [],
    isLoading: queryResult.isLoading,
    error: queryResult.error,
    refetch: queryResult.refetch,
  };
}

/**
 * Hook to get multiple permission checks at once
 */
export function useHasAnyPermission(permissions: PermissionString[]) {
  const checks = permissions.map((permission) => useHasPermission(permission));

  const hasAny = checks.some((check) => check.data?.hasPermission === true);
  const isLoading = checks.some((check) => check.isLoading);

  return {
    hasAny,
    isLoading,
    checks: checks.map((check, index) => ({
      permission: permissions[index],
      hasPermission: check.data?.hasPermission ?? false,
      reason: check.data?.reason,
    })),
  };
}

/**
 * Hook to check if user has all specified permissions
 */
export function useHasAllPermissions(permissions: PermissionString[]) {
  const checks = permissions.map((permission) => useHasPermission(permission));

  const hasAll = checks.every((check) => check.data?.hasPermission === true);
  const isLoading = checks.some((check) => check.isLoading);

  return {
    hasAll,
    isLoading,
    checks: checks.map((check, index) => ({
      permission: permissions[index],
      hasPermission: check.data?.hasPermission ?? false,
      reason: check.data?.reason,
    })),
  };
}
