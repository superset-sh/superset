import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { MyPermissionsPage } from './pages';

/**
 * User Role Permission Routes (Auth required)
 */
export function createRolePermissionAuthRoutes(rootRoute: AnyRoute) {
  // /my-permissions
  const myPermissionsRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/my-permissions',
    component: MyPermissionsPage,
  });

  return [myPermissionsRoute];
}
