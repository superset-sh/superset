// Create Role DTOs
export {
  createRoleInputSchema,
  createRoleOutputSchema,
  type CreateRoleInput,
  type CreateRoleOutput,
} from './create-role.dto';

// Update Role DTOs
export {
  updateRoleInputSchema,
  updateRoleOutputSchema,
  deleteRoleInputSchema,
  deleteRoleOutputSchema,
  type UpdateRoleInput,
  type UpdateRoleOutput,
  type DeleteRoleInput,
  type DeleteRoleOutput,
} from './update-role.dto';

// Assign Roles DTOs
export {
  assignRolesInputSchema,
  assignRolesOutputSchema,
  removeRoleInputSchema,
  removeRoleOutputSchema,
  assignPermissionsInputSchema,
  assignPermissionsOutputSchema,
  removePermissionInputSchema,
  removePermissionOutputSchema,
  type AssignRolesInput,
  type AssignRolesOutput,
  type RemoveRoleInput,
  type RemoveRoleOutput,
  type AssignPermissionsInput,
  type AssignPermissionsOutput,
  type RemovePermissionInput,
  type RemovePermissionOutput,
} from './assign-roles.dto';

// Permission Query DTOs
export {
  getPermissionsQuerySchema,
  getPermissionInputSchema,
  getRoleQuerySchema,
  getRolesQuerySchema,
  getUserRolesQuerySchema,
  getMyPermissionsQuerySchema,
  checkPermissionInputSchema,
  checkPermissionOutputSchema,
  type GetPermissionsQuery,
  type GetPermissionInput,
  type GetRoleQuery,
  type GetRolesQuery,
  type GetUserRolesQuery,
  type GetMyPermissionsQuery,
  type CheckPermissionInput,
  type CheckPermissionOutput,
} from './permission-query.dto';
