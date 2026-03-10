import { pgTable, uuid, timestamp, unique } from 'drizzle-orm/pg-core';
import { profiles } from '../profiles';
import { roles } from './roles';

/**
 * User Roles Junction Table
 *
 * 사용자-역할 다대다 관계 (단일 테넌트)
 */
export const userRoles = pgTable(
  'user_roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
    assignedBy: uuid('assigned_by').references(() => profiles.id),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    uniqueUserRole: unique('unique_user_role').on(table.userId, table.roleId),
  })
);

export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
