import { db } from "@superset/db/client";
import type { integrationProvider } from "@superset/db/schema";
import { DrizzleQueryError, sql } from "drizzle-orm";

type Provider = (typeof integrationProvider.enumValues)[number];

export interface RecordedDelivery {
	id: string;
	status: string;
	retryCount: number;
	receivedAt: Date;
}

/**
 * Drizzle wraps a failed query in a DrizzleQueryError whose message, and own
 * `query`/`params` properties, are the statement text followed by every bind
 * parameter. One of ours is the entire webhook body, so reporting that error
 * unmodified publishes a third party's payload into the error tracker.
 *
 * Rethrow with the operation, the provider and the driver's own message, and
 * the driver error as the cause so its code and stack still reach the report:
 * a failure says what broke and why, without the body. Anything that is not
 * the wrapper carries no bind parameters and is left exactly as it was.
 */
function withoutBoundParameters(provider: Provider, error: unknown): unknown {
	if (!(error instanceof DrizzleQueryError)) return error;
	const cause = error.cause;
	return new Error(
		`recordWebhookDelivery failed for ${provider} writing ingest.webhook_events and ingest.webhook_payloads: ${cause?.message ?? "unknown database error"}`,
		{ cause },
	);
}

/**
 * Records one delivery: identity and state in ingest.webhook_events, body in
 * the day-partitioned ingest.webhook_payloads.
 *
 * One statement, so the hottest write path in the product still costs a single
 * round trip and the two tables cannot diverge. The final SELECT reads from the
 * event CTE rather than from the payload insert — on a redelivery the payload
 * already exists, ON CONFLICT DO NOTHING returns no rows, and returning from
 * the insert would tell the caller the delivery failed when it did not.
 *
 * Dedup stays on (provider, event_id) exactly as before, which is only possible
 * because webhook_events is not the partitioned table: a unique index on a
 * partitioned table must include the partition key, and a redelivery arrives
 * with a different received_at, so it would no longer conflict.
 */
export async function recordWebhookDelivery({
	provider,
	eventId,
	eventType,
	payload,
}: {
	provider: Provider;
	eventId: string;
	eventType: string;
	payload: unknown;
}): Promise<RecordedDelivery | null> {
	const result = await db
		.execute<{
			id: string;
			status: string;
			retry_count: number;
			received_at: string | Date;
		}>(sql`
		WITH event AS (
			INSERT INTO ingest.webhook_events (provider, event_id, event_type, status)
			VALUES (${provider}, ${eventId}, ${eventType}, 'pending')
			ON CONFLICT (provider, event_id) DO UPDATE SET
				-- Reset for reprocessing only if previously failed.
				status = CASE WHEN ingest.webhook_events.status = 'failed'
					THEN 'pending' ELSE ingest.webhook_events.status END,
				retry_count = CASE WHEN ingest.webhook_events.status = 'failed'
					THEN ingest.webhook_events.retry_count + 1
					ELSE ingest.webhook_events.retry_count END,
				error = CASE WHEN ingest.webhook_events.status = 'failed'
					THEN NULL ELSE ingest.webhook_events.error END
			RETURNING id, status, retry_count, received_at
		), body AS (
			INSERT INTO ingest.webhook_payloads (webhook_event_id, received_at, payload)
			SELECT event.id, event.received_at, ${JSON.stringify(payload)}::jsonb
			FROM event
			ON CONFLICT DO NOTHING
			RETURNING webhook_event_id
		)
		SELECT id, status, retry_count, received_at FROM event
	`)
		.catch((error: unknown) => {
			throw withoutBoundParameters(provider, error);
		});

	const row = result.rows[0];
	if (!row) return null;

	return {
		id: row.id,
		status: row.status,
		retryCount: row.retry_count,
		receivedAt:
			row.received_at instanceof Date
				? row.received_at
				: new Date(`${String(row.received_at).replace(" ", "T")}Z`),
	};
}
