// Module
export { RolePermissionModule } from './role-permission.module';

// tRPC Router
export { rolePermissionRouter, type RolePermissionRouter } from './trpc';

// Services
export { RoleService } from './services';
export { PermissionService } from './services';
export { AuthorizationService } from './services';

// Middleware
export { requirePermission, requireAnyPermission, requireAllPermissions, requireResourceAccess } from './middleware';

// Types
export * from './types';
