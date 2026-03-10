import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { profiles } from "./profiles";

/**
 * Files 테이블 (시스템 기반)
 * - 여러 Feature가 첨부파일로 참조 가능
 * - Supabase Storage 연동
 */
export const files = pgTable("files", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  originalName: text("original_name").notNull(),
  mimeType: text("mime_type").notNull(),
  size: integer("size").notNull(),
  url: text("url").notNull(),
  // Supabase Storage 관련 컬럼
  bucket: text("bucket").notNull().default("files"),
  path: text("path").notNull(),
  publicUrl: text("public_url"),
  uploadedById: uuid("uploaded_by_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Type exports
export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
