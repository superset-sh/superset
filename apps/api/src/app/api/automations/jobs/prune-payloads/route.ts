import { sql } from "drizzle-orm";

import { singleFlight } from "@/lib/singleFlight";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

/**
 * Matches enforce-retention. A batch measured 224 s in production, so on the
 * platform default this route was killed before its first batch returned.
 */
export const maxDuration = 300;

/**
 * Matches ingest.webhook_events. These are the same provider bodies, kept a
 * second time because the dispatcher needs them at dispatch and ingest is
 * prunable underneath it — so once dispatch has happened this copy is as
 * disposable as the first.
 */
const RETAIN_DAYS = 7;

/** Small enough that one statement is a short transaction on a 4M-row table. */
const BATCH_SIZE = 5_000;

/**
 * Ceiling per run. Every prune is an UPDATE, so it leaves a dead tuple behind;
 * this is what stops a backlog drain outrunning autovacuum and bloating the
 * heap.
 */
const MAX_ROWS_PER_RUN = 50_000;

/** Well inside the function timeout, so a run ends by choice rather than by kill. */
const TIME_BUDGET_MS = 20_000;

/**
 * google_calendar is excluded outright. Its ingest path reads the most recent
 * payload for a resource back to diff a calendar event against its previous
 * state (apps/api/src/app/api/integrations/google/lib/syncCalendar.ts), and
 * that row can be arbitrarily old — an event nobody has touched in months is
 * exactly the one whose previous state still matters. It is also 2,251 rows
 * and 2.5MB, so keeping all of it costs nothing worth measuring.
 */
const PAYLOAD_READBACK_PROVIDERS = ["google_calendar"];

/**
 * Built as an explicit list rather than passing the array as one bind
 * parameter: drizzle sends a JS array as a record, and Postgres will not cast
 * that to text[], so `<> ALL($1)` fails on every run.
 */
const excludedProviders = sql.join(
	PAYLOAD_READBACK_PROVIDERS.map((provider) => sql`${provider}`),
	sql`, `,
);

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/automations/jobs/prune-payloads",
	);
	if (rejected) return rejected;

	const startedAt = Date.now();
	let pruned = 0;
	let batches = 0;
	// Pruned rows form a contiguous oldest-first prefix, so without this the
	// scan re-skips everything it already cleared on every batch.
	let cursor: string | null = null;

	let skipped = false;
	while (Date.now() - startedAt < TIME_BUDGET_MS && pruned < MAX_ROWS_PER_RUN) {
		const attempt = await singleFlight("automations.prune-payloads", (tx) =>
			tx.execute(sql`
			WITH batch AS (
				SELECT id, received_at
				FROM automation_events
				WHERE payload IS NOT NULL
				  AND received_at < now() - ${`${RETAIN_DAYS} days`}::interval
				  AND provider NOT IN (${excludedProviders})
				  -- A row still awaiting its handoff is re-dispatched from
				  -- dispatch_input rather than payload, but leaving it whole
				  -- keeps the sweep's inputs untouched for the cost of a few rows.
				  AND (dispatched_at IS NOT NULL OR dispatch_input IS NULL)
				  ${cursor ? sql`AND received_at >= ${cursor}::timestamptz` : sql``}
				ORDER BY received_at
				LIMIT ${BATCH_SIZE}
				-- Two runs can overlap (a QStash retry, or a slow run still going
				-- when the next tick fires). Without this they select the same
				-- rows and the second re-clears what the first already did,
				-- doubling the dead tuples and overstating the count.
				FOR UPDATE SKIP LOCKED
			)
			UPDATE automation_events e
			SET payload = NULL
			FROM batch
			WHERE e.id = batch.id
			  AND e.payload IS NOT NULL
			RETURNING batch.received_at
		`),
		);
		if (!attempt.ran) {
			skipped = true;
			break;
		}

		const returned = attempt.result.rows as Array<{ received_at: string }>;
		pruned += returned.length;
		batches++;
		if (returned.length < BATCH_SIZE) break;

		cursor = returned[returned.length - 1]?.received_at ?? cursor;
	}

	return Response.json({
		pruned,
		batches,
		// Another run held the lock; its batches count for this tick.
		skipped,
		// Whether the run stopped on a limit rather than running out of work.
		more:
			skipped ||
			pruned >= MAX_ROWS_PER_RUN ||
			Date.now() - startedAt >= TIME_BUDGET_MS,
	});
}
