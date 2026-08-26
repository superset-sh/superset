import {
	index,
	integer,
	pgSchema,
	text,
	timestamp,
	uniqueIndex,
	uuid,
} from "drizzle-orm/pg-core";
import { integrationProvider } from "./schema";

export const ingestSchema = pgSchema("ingest");

/**
 * Identity, dedup and processing state for a delivery. Deliberately without
 * the body: bodies live in ingest.webhook_payloads, which is partitioned by
 * day so retention is a DROP rather than an UPDATE that leaves 400GB of dead
 * tuples behind. Keeping this table unpartitioned is what lets the dedup index
 * stay on (provider, event_id) — a unique index on a partitioned table has to
 * include the partition key, and adding received_at to it would mean a
 * redelivery no longer conflicts, silently disabling dedup.
 *
 * webhook_payloads is not declared here. It is created by a custom migration
 * (drizzle has no syntax for PARTITION BY) and only ever written, never read
 * back by application code, so there is nothing for a schema type to serve.
 */
export const webhookEvents = ingestSchema.table(
	"webhook_events",
	{
		id: uuid().primaryKey().defaultRandom(),

		// Source
		provider: integrationProvider().notNull(),
		eventId: text("event_id").notNull(),
		eventType: text("event_type"),

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
