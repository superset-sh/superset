import { createRoute, type AnyRoute } from '@tanstack/react-router';
import { RolesManagementPage, UsersManagementPage, MyPermissionsPage, TermsManagementPage } from './pages';

// 경로 상수
export const USERS_ADMIN_PATH = "/users";
export const ROLES_ADMIN_PATH = "/roles";
export const TERMS_ADMIN_PATH = "/terms";

/**
 * Admin Role Permission Routes
 */
export function createRolePermissionAdminRoutes(parentRoute: AnyRoute) {
  // /roles
  const rolesManagementRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/roles',
    component: RolesManagementPage,
  });

  // /users
  const usersManagementRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/users',
    component: UsersManagementPage,
  });

  // /terms
  const termsManagementRoute = createRoute({
    getParentRoute: () => parentRoute,
    path: '/terms',
    component: TermsManagementPage,
  });

  return [rolesManagementRoute, usersManagementRoute, termsManagementRoute];
}

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
