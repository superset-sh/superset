import { baseColumns } from "../../../utils";
import { boolean, integer, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// ============================================================================
// Enums
// ============================================================================

export const systemJobRunStatusEnum = pgEnum("system_job_run_status", [
  "running",
  "success",
  "failed",
]);

// ============================================================================
// Tables
// ============================================================================

export const systemScheduledJobs = pgTable("system_scheduled_jobs", {
  ...baseColumns(),
  jobKey: text("job_key").notNull().unique(),
  displayName: text("display_name").notNull(),
  description: text("description"),
  cronExpression: text("cron_expression").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  lastRunAt: timestamp("last_run_at", { withTimezone: true }),
  nextRunAt: timestamp("next_run_at", { withTimezone: true }),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
});

export const systemJobRuns = pgTable("system_job_runs", {
  ...baseColumns(),
  jobId: uuid("job_id")
    .notNull()
    .references(() => systemScheduledJobs.id, { onDelete: "cascade" }),
  status: systemJobRunStatusEnum("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  durationMs: integer("duration_ms"),
  result: jsonb("result").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
});

// ============================================================================
// Type Exports
// ============================================================================

export type SystemScheduledJob = typeof systemScheduledJobs.$inferSelect;
export type NewSystemScheduledJob = typeof systemScheduledJobs.$inferInsert;

export type SystemJobRun = typeof systemJobRuns.$inferSelect;
export type NewSystemJobRun = typeof systemJobRuns.$inferInsert;
