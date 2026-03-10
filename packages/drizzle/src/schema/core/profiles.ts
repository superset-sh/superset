import { boolean, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const authProviderEnum = pgEnum("auth_provider", [
  "email", "google", "naver", "kakao"
]);

/**
 * Profiles 테이블 (시스템 기반)
 * - Supabase auth.users와 연동되는 프로필 테이블
 * - 거의 모든 Feature가 참조
 * - 역할 관리는 role-permission 기능의 user_roles 테이블을 통해 처리됨
 */
export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  email: text("email").unique().notNull(),
  avatar: text("avatar"),
  authProvider: authProviderEnum("auth_provider").default("email"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  marketingConsentAt: timestamp("marketing_consent_at", { withTimezone: true }),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Type exports
export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
