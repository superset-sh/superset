// Role hooks
export {
  useRoles,
  useRole,
  useRoleWithPermissions,
  useCreateRole,
  useUpdateRole,
  useDeleteRole,
  useAssignPermissionsToRole,
  useRemovePermissionFromRole,
} from './use-roles';

// Permission hooks
export {
  usePermissions,
  usePermission,
  usePermissionsByCategory,
  usePermissionsWithLoading,
  usePermissionsByCategoryWithLoading,
} from './use-permissions';

// User role hooks
export {
  useUserRoles,
  useUserRolesWithLoading,
  useAssignRolesToUser,
  useRemoveRoleFromUser,
} from './use-user-roles';

// My permissions hooks
export {
  useMyRoles,
  useMyPermissions,
  useMyPermissionSet,
  useHasPermission,
  useCanAccess,
  useMyRolesWithLoading,
  useMyPermissionsWithLoading,
  useHasAnyPermission,
  useHasAllPermissions,
} from './use-my-permissions';

// Admin user management hooks
export {
  useAdminUsers,
  useUpdateUserRole,
  useDeactivateUser,
  useReactivateUser,
} from './use-admin-users';

// Terms hooks
export {
  useAdminTerms,
  useCreateTerm,
  useUpdateTerm,
  useDeleteTerm,
} from './use-terms';
