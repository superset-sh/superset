// Permission types
export type {
  PermissionCheck,
  UserPermissionSet,
  PermissionString,
  ResourcePermissionContext,
  PermissionWithMetadata,
  PermissionQueryFilters,
} from './permission.types';

export { PermissionCategory, PermissionScope } from './permission.types';

// Role types
export type {
  RoleWithPermissions,
  RoleWithUsers,
  UserRoleInfo,
  RoleAssignmentResult,
  RoleStats,
  RoleQueryFilters,
  RolePermissionSummary,
} from './role.types';

export { SystemRole } from './role.types';
