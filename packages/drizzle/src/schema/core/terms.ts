import { boolean, integer, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";

/**
 * Terms 테이블 (Core)
 * - 가입 시 동의해야 하는 약관 목록
 * - Admin에서 등록/관리
 * - 물리 삭제 대신 isActive: false로 비활성 처리
 */
export const terms = pgTable("terms", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  url: text("url").notNull(),
  isRequired: boolean("is_required").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Type exports
export type Term = typeof terms.$inferSelect;
export type NewTerm = typeof terms.$inferInsert;
