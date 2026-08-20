import { dbWs } from "@superset/db/client";
import { sql } from "drizzle-orm";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

/**
 * How long a raw payload is worth keeping. Nothing reads it back — its only use
 * is inspecting a delivery by hand, which is a days-old question, not a
 * months-old one. Everything identifying the event outlives it.
 */
const RETAIN_DAYS = 14;

/** Small enough that one statement is a short transaction on a 90M-row table. */
const BATCH_SIZE = 5_000;

/**
 * Ceiling per run. Every prune is an UPDATE, so it leaves a dead tuple behind;
 * this is what stops a backlog drain outrunning autovacuum and bloating the
 * heap. Paced against the cron interval it also sets the drain rate — at one run
 * every 5 minutes this is ~14M rows/day, so the backlog clears in days without
 * the database ever being under a write spike.
 */
const MAX_ROWS_PER_RUN = 50_000;

/** Well inside the function timeout, so a run ends by choice rather than by kill. */
const TIME_BUDGET_MS = 20_000;

export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/ingest/prune-payloads",
	);
	if (rejected) return rejected;

	const startedAt = Date.now();
	let pruned = 0;
	let batches = 0;
	// Pruned rows form a contiguous oldest-first prefix, so without this the scan
	// re-skips everything it already cleared on every batch. Carrying the high
	// water mark within a run means that cost is paid once, not per batch.
	let cursor: string | null = null;

	// One statement per batch, each its own transaction, so WAL stays bounded and
	// a long backlog is chewed through across runs rather than in one held-open
	// transaction.
	while (Date.now() - startedAt < TIME_BUDGET_MS && pruned < MAX_ROWS_PER_RUN) {
		const result = await dbWs.execute(sql`
			WITH batch AS (
				SELECT id, received_at
				FROM ingest.webhook_events
				WHERE payload IS NOT NULL
				  AND received_at < now() - ${`${RETAIN_DAYS} days`}::interval
				  AND status IN ('processed', 'skipped')
				  ${cursor ? sql`AND received_at >= ${cursor}::timestamp` : sql``}
				ORDER BY received_at
				LIMIT ${BATCH_SIZE}
			)
			UPDATE ingest.webhook_events e
			SET payload = NULL
			FROM batch
			WHERE e.id = batch.id
			RETURNING batch.received_at
		`);

		const returned = result.rows as Array<{ received_at: string }>;
		pruned += returned.length;
		batches++;
		if (returned.length < BATCH_SIZE) break;

		// Rows are ordered, so the last one is the mark to resume from.
		cursor = returned[returned.length - 1]?.received_at ?? cursor;
	}

	return Response.json({
		pruned,
		batches,
		// Whether the run stopped on a limit rather than running out of work —
		// the cheap version of "is there still a backlog?". An exact count would
		// mean scanning tens of millions of rows on every run.
		hitLimit: pruned >= MAX_ROWS_PER_RUN,
		retainDays: RETAIN_DAYS,
		elapsedMs: Date.now() - startedAt,
	});
}
