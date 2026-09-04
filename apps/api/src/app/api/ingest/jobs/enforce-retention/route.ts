import { type SQL, sql } from "drizzle-orm";

import { singleFlight } from "@/lib/singleFlight";
import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

/**
 * Matches the other long-running job routes. Without it this route took the
 * platform default, which is shorter than a single batch now takes, so a run
 * was killed mid-loop rather than ending on its own time budget.
 */
export const maxDuration = 300;

/**
 * How long an event record itself is worth keeping, separate from its body.
 *
 * The constraint is idempotency, not storage: the unique indexes on these
 * tables are what stop a redelivered event being processed twice, and a row
 * that no longer exists cannot dedupe. Providers redeliver within hours to a
 * few days, so thirty is well past any real replay window while still bounding
 * the tables.
 */
const RETAIN_DAYS = 30;

/** Small enough that one statement stays a short transaction. */
const BATCH_SIZE = 5_000;

/**
 * Ceiling per table per run. Deleting leaves dead tuples, so this is what stops
 * a backlog drain outrunning autovacuum.
 *
 * It has never been the binding constraint. TIME_BUDGET_MS is, because a batch
 * costs far more than this file originally assumed — see there.
 */
const MAX_ROWS_PER_TABLE = 50_000;

/**
 * Has to exceed the cost of a batch, or the loop can only ever run one.
 *
 * A batch is `ORDER BY received_at LIMIT 5000` off the left edge of
 * webhook_events_received_at_idx, and every prior delete leaves dead index
 * entries in exactly that prefix for the next batch to walk. Measured against
 * production over 1226 batches: 35s mean, 582s worst. At the previous 20s the
 * deadline check after batch one always failed, so a run deleted 5k rows rather
 * than the 50k intended — an order of magnitude under what the ceiling implies,
 * and roughly break-even against intake once the backlog is drained.
 */
const TIME_BUDGET_MS = 240_000;

interface RetentionTarget {
	label: string;
	/** Qualified table name, and the column holding the row's age. */
	relation: SQL;
	receivedAt: SQL;
}

/**
 * automation_events is deliberately absent. Bounding it needs two index builds
 * that take write locks on live ingest tables — one on automation_events
 * itself, and one on automation_runs.event_id, which its ON DELETE SET NULL
 * foreign key would otherwise resolve by scanning. Neither is worth doing now:
 * the table was created on 2026-08-15, so no row reaches thirty days until
 * mid-September, and the us-east-1 restore rebuilds both tables before then
 * with those indexes created on the way in, for free. It joins this list there.
 */
const TARGETS: RetentionTarget[] = [
	{
		label: "webhook_events",
		relation: sql`ingest.webhook_events`,
		receivedAt: sql`received_at`,
	},
];

async function deleteAgedRows(
	target: RetentionTarget,
	deadline: number,
): Promise<{ deleted: number; more: boolean; skipped: boolean }> {
	let deleted = 0;
	while (Date.now() < deadline && deleted < MAX_ROWS_PER_TABLE) {
		const attempt = await singleFlight(
			`ingest.enforce-retention.${target.label}`,
			(tx) =>
				tx.execute(sql`
			WITH batch AS (
				SELECT ctid FROM ${target.relation}
				WHERE ${target.receivedAt} < now() - ${`${RETAIN_DAYS} days`}::interval
				ORDER BY ${target.receivedAt}
				LIMIT ${BATCH_SIZE}
				FOR UPDATE SKIP LOCKED
			)
			DELETE FROM ${target.relation} t
			USING batch WHERE t.ctid = batch.ctid
			RETURNING 1
		`),
		);
		// Another run holds this table; its batches count for this tick.
		if (!attempt.ran) return { deleted, more: true, skipped: true };
		const rows = attempt.result.rows.length;
		deleted += rows;
		if (rows < BATCH_SIZE) return { deleted, more: false, skipped: false };
	}
	return { deleted, more: true, skipped: false };
}

/**
 * Bounds the two event logs by age.
 *
 * Their bodies are already bounded — webhook bodies by dropping day partitions,
 * automation payloads by the pruner — but nothing removed the rows, so both
 * grew without limit at a combined ~1.9M/day. Deleting rather than partitioning
 * because the dedup indexes have to stay on (provider, event_id) and
 * (integration_connection_id, provider, external_event_id): a unique index on a
 * partitioned table must contain the partition key, and adding received_at to
 * it would mean a redelivery no longer conflicts.
 *
 * Deletion is cheap here in a way it would not have been a week ago. These rows
 * are ~350 bytes with nothing in TOAST now that the bodies live elsewhere, so a
 * batch leaves little for autovacuum to chase.
 *
 * webhook_payloads needs no equivalent: its rows are keyed by received_at and
 * their partitions are dropped at seven days, so a body is always gone long
 * before the event record that pointed at it.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/ingest/jobs/enforce-retention",
	);
	if (rejected) return rejected;

	// Sliced per target rather than shared, so the first table cannot spend the
	// whole budget and leave the rest untouched. Moot at one target; not once a
	// second joins, which is when it would be easy to miss.
	const perTarget = Math.floor(TIME_BUDGET_MS / TARGETS.length);
	const results: Record<
		string,
		{ deleted: number; more: boolean; skipped: boolean }
	> = {};

	for (const target of TARGETS) {
		try {
			results[target.label] = await deleteAgedRows(
				target,
				Date.now() + perTarget,
			);
		} catch (error) {
			console.error(
				`[ingest/enforce-retention] ${target.label} failed:`,
				error,
			);
			return Response.json(
				{ error: `Retention failed for ${target.label}`, results },
				{ status: 500 },
			);
		}
	}

	return Response.json({ retainDays: RETAIN_DAYS, results });
}
