import { pgTable, text, unique } from 'drizzle-orm/pg-core';
import { baseColumns } from '../../../utils';

/**
 * Permissions Table
 *
 * Stores all available permissions in the system
 */
export const permissions = pgTable(
  'permissions',
  {
    ...baseColumns(),
    resource: text('resource').notNull(),
    action: text('action').notNull(),
    scope: text('scope'),
    description: text('description'),
    category: text('category'),
  },
  (table) => ({
    uniquePermission: unique('unique_permission').on(table.resource, table.action, table.scope),
  })
);

export type Permission = typeof permissions.$inferSelect;
export type NewPermission = typeof permissions.$inferInsert;
