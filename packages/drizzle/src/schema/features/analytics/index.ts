import { baseColumns } from "../../../utils";
import { profiles } from "../../core/profiles";
import { date, integer, jsonb, pgTable, text, unique, uuid } from "drizzle-orm/pg-core";

// ============================================================================
// Tables
// ============================================================================

export const systemAnalyticsEvents = pgTable("system_analytics_events", {
  ...baseColumns(),

  eventType: text("event_type").notNull(),
  userId: uuid("user_id").references(() => profiles.id, { onDelete: "set null" }),
  resourceType: text("resource_type"),
  resourceId: text("resource_id"),
  eventData: jsonb("event_data").$type<Record<string, unknown>>(),
});

export const systemDailyMetrics = pgTable("system_daily_metrics", {
  ...baseColumns(),

  date: date("date", { mode: "date" }).notNull(),
  metricKey: text("metric_key").notNull(),
  value: integer("value").notNull().default(0),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
}, (table) => [
  unique("uq_daily_metrics_date_key").on(table.date, table.metricKey),
]);

// ============================================================================
// Type Exports
// ============================================================================

export type SystemAnalyticsEvent = typeof systemAnalyticsEvents.$inferSelect;
export type NewSystemAnalyticsEvent = typeof systemAnalyticsEvents.$inferInsert;

export type SystemDailyMetric = typeof systemDailyMetrics.$inferSelect;
export type NewSystemDailyMetric = typeof systemDailyMetrics.$inferInsert;
