import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";
import { jsonb, pgEnum, pgTable, text, uuid } from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const systemAuditActionEnum = pgEnum("system_audit_action", [
  "create",
  "update",
  "delete",
  "assign",
  "adjust",
  "sync",
  "config_change",
]);

// ============================================================================
// Tables
// ============================================================================

export const systemAuditLogs = pgTable("system_audit_logs", {
  ...baseColumns(),

  userId: uuid("user_id")
    .notNull()
    .references(() => profiles.id, { onDelete: "cascade" }),
  action: systemAuditActionEnum("action").notNull(),

  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  description: text("description").notNull(),

  changes: jsonb("changes").$type<{
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }>(),
  metadata: jsonb("metadata").$type<{
    ipAddress?: string;
    userAgent?: string;
    [key: string]: unknown;
  }>(),
});

// ============================================================================
// Type Exports
// ============================================================================

export type SystemAuditLog = typeof systemAuditLogs.$inferSelect;
export type NewSystemAuditLog = typeof systemAuditLogs.$inferInsert;
