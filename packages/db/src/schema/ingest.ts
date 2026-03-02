import {
	index,
	integer,
	jsonb,
	pgSchema,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { integrationProvider } from "./schema";

export const ingestSchema = pgSchema("ingest");

export const webhookEvents = ingestSchema.table(
	"webhook_events",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Source
		provider: integrationProvider().notNull(),
		eventId: text("event_id").notNull(),
		eventType: text("event_type"),

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
		uniqueIndex("webhook_events_provider_event_id_idx").on(
			table.provider,
			table.eventId,
		),
		index("webhook_events_received_at_idx").on(table.receivedAt),
	],
);

export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;
export type SelectWebhookEvent = typeof webhookEvents.$inferSelect;
