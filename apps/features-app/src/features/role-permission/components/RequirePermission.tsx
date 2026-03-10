import { ReactNode } from 'react';
import { useCanAccess } from '../hooks';
import { ForbiddenPage } from './ForbiddenPage';
type PermissionString = `${string}.${string}` | `${string}.${string}.${string}`;

interface RequirePermissionProps {
  permission: PermissionString;
  resourceOwnerId?: string;
  fallback?: ReactNode;
  loadingFallback?: ReactNode;
  children: ReactNode;
}

/**
 * Higher-Order Component to require permission
 *
 * Usage:
 * ```tsx
 * <RequirePermission permission="posts.create">
 *   <CreatePostButton />
 * </RequirePermission>
 * ```
 */
export function RequirePermission({
  permission,
  resourceOwnerId,
  fallback,
  loadingFallback,
  children,
}: RequirePermissionProps) {
  const { canAccess, isLoading } = useCanAccess(permission, resourceOwnerId);

  if (isLoading) {
    return (
      <>
        {loadingFallback || (
          <div className="flex items-center justify-center p-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        )}
      </>
    );
  }

  if (!canAccess) {
    return (
      <>
        {fallback || (
          <ForbiddenPage
            message="You don't have permission to view this content."
            requiredPermission={permission}
          />
        )}
      </>
    );
  }

  return <>{children}</>;
}

/**
 * Inline permission check component
 *
 * Usage:
 * ```tsx
 * <IfHasPermission permission="posts.update.all">
 *   <EditButton />
 * </IfHasPermission>
 * ```
 */
interface IfHasPermissionProps {
  permission: PermissionString;
  resourceOwnerId?: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function IfHasPermission({
  permission,
  resourceOwnerId,
  children,
  fallback = null,
}: IfHasPermissionProps) {
  const { canAccess, isLoading } = useCanAccess(permission, resourceOwnerId);

  if (isLoading) {
    return null;
  }

  return <>{canAccess ? children : fallback}</>;
}

/**
 * Inline permission check for any of multiple permissions
 *
 * Usage:
 * ```tsx
 * <IfHasAnyPermission permissions={['posts.update.own', 'posts.update.all']}>
 *   <EditButton />
 * </IfHasAnyPermission>
 * ```
 */
interface IfHasAnyPermissionProps {
  permissions: PermissionString[];
  children: ReactNode;
  fallback?: ReactNode;
}

export function IfHasAnyPermission({
  permissions,
  children,
  fallback = null,
}: IfHasAnyPermissionProps) {
  const checks = permissions.map((permission) => useCanAccess(permission));

  const isLoading = checks.some((check) => check.isLoading);
  const hasAny = checks.some((check) => check.canAccess);

  if (isLoading) {
    return null;
  }

  return <>{hasAny ? children : fallback}</>;
}
