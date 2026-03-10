import { pgTable, uuid, timestamp, unique } from 'drizzle-orm/pg-core';
import { roles } from './roles';
import { permissions } from './permissions';

/**
 * Role Permissions Junction Table
 *
 * Many-to-Many relationship between roles and permissions
 */
export const rolePermissions = pgTable(
  'role_permissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    permissionId: uuid('permission_id')
      .notNull()
      .references(() => permissions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueRolePermission: unique('unique_role_permission').on(table.roleId, table.permissionId),
  })
);

export type RolePermission = typeof rolePermissions.$inferSelect;
export type NewRolePermission = typeof rolePermissions.$inferInsert;
