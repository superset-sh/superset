import { pgTable, text, boolean, integer } from 'drizzle-orm/pg-core';
import { baseColumns } from '../../../utils';

/**
 * Roles Table
 *
 * 시스템 역할 정의 (guest/member/admin/owner + 커스텀 역할)
 */
export const roles = pgTable('roles', {
  ...baseColumns(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  isSystem: boolean('is_system').notNull().default(false),
  color: text('color'),
  icon: text('icon'),
  priority: integer('priority').notNull().default(0),
});

export type Role = typeof roles.$inferSelect;
export type NewRole = typeof roles.$inferInsert;
