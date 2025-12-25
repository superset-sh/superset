import {
	index,
	integer,
	jsonb,
	pgSchema,
	text,
	timestamp,
	uuid,
} from "drizzle-orm/pg-core";

export const ingestSchema = pgSchema("ingest");

// Raw webhook storage for debugging/replay
export const webhookEvents = ingestSchema.table(
	"webhook_events",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Source
		provider: text().notNull(), // "linear" | "github" | etc.
		eventId: text("event_id"), // Provider's event ID (idempotency)
		eventType: text("event_type"), // "Issue", "issue.created", etc.

		// Raw payload
		payload: jsonb().notNull(),

		// Processing state
		status: text().notNull().default("pending"), // pending | processed | failed | skipped
		processedAt: timestamp("processed_at"),
		error: text(),
		retryCount: integer("retry_count").notNull().default(0),

		receivedAt: timestamp("received_at").notNull().defaultNow(),
	},
	(table) => [
		index("webhook_events_provider_status_idx").on(
			table.provider,
			table.status,
		),
		index("webhook_events_event_id_idx").on(table.provider, table.eventId),
		index("webhook_events_received_at_idx").on(table.receivedAt),
	],
);

export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;
export type SelectWebhookEvent = typeof webhookEvents.$inferSelect;
