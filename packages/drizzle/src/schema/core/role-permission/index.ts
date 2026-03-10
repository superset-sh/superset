import { relations } from 'drizzle-orm';
import { roles } from './roles';
import { permissions } from './permissions';
import { rolePermissions } from './role-permissions';
import { userRoles } from './user-roles';
import { profiles } from '../profiles';

// Export tables
export * from './roles';
export * from './permissions';
export * from './role-permissions';
export * from './user-roles';

// Relations
export const rolesRelations = relations(roles, ({ many }) => ({
  rolePermissions: many(rolePermissions),
  userRoles: many(userRoles),
}));

export const permissionsRelations = relations(permissions, ({ many }) => ({
  rolePermissions: many(rolePermissions),
}));

export const rolePermissionsRelations = relations(rolePermissions, ({ one }) => ({
  role: one(roles, {
    fields: [rolePermissions.roleId],
    references: [roles.id],
  }),
  permission: one(permissions, {
    fields: [rolePermissions.permissionId],
    references: [permissions.id],
  }),
}));

export const userRolesRelations = relations(userRoles, ({ one }) => ({
  user: one(profiles, {
    fields: [userRoles.userId],
    references: [profiles.id],
  }),
  role: one(roles, {
    fields: [userRoles.roleId],
    references: [roles.id],
  }),
  assignedByUser: one(profiles, {
    fields: [userRoles.assignedBy],
    references: [profiles.id],
  }),
}));
