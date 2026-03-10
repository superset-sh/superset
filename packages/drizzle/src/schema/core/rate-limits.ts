import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";
import { baseColumns } from "../../utils";

// ============================================================================
// Tables
// ============================================================================

/**
 * Rate limit tracking table
 * Stores rate limit events for sliding window counting
 */
export const rateLimits = pgTable(
  "rate_limits",
  {
    ...baseColumns(),
    /** Unique key: e.g., "community:create:<userId>" */
    key: text("key").notNull(),
    /** Action type for grouping */
    action: text("action").notNull(),
    /** When this rate limit event occurred */
    consumedAt: timestamp("consumed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_rate_limits_key_consumed").on(table.key, table.consumedAt),
    index("idx_rate_limits_action").on(table.action),
  ],
);

// ============================================================================
// Type Exports
// ============================================================================

export type RateLimit = typeof rateLimits.$inferSelect;
export type NewRateLimit = typeof rateLimits.$inferInsert;
