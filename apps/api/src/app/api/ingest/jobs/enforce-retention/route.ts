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
 * The constraint is idempotency, not storage: the unique index on
 * (provider, event_id) is what stops a redelivered event being processed
 * twice, and a row that no longer exists cannot dedupe. Two days covers every
 * automatic redelivery any provider here attempts — Slack's five minutes,
 * Linear's one minute, one hour and six hours, and Notion's eight tries over
 * roughly a day — with a day to spare. Slack is the one that needs it most:
 * agent delivery dedupes on this row alone, where the others are caught a
 * second time by the unique index on automation_events.
 *
 * Two days of intake is ~9M rows, small enough for the indexes to stay in
 * cache. Past that each delete costs more than the insert it undoes and
 * retention falls behind faster the further behind it gets.
 */
const RETAIN_HOURS = 48;

/** Small enough that one statement stays a short transaction. */
const BATCH_SIZE = 5_000;

/**
 * Ceiling per table per run. Deleting leaves dead tuples, so this is what stops
 * a backlog drain outrunning autovacuum.
 *
 * Intake is ~190k rows an hour on a weekday, so this keeps up only while the
 * QStash schedule fires at least four times an hour. That schedule lives in the
 * Upstash console, not in this repo.
 */
const MAX_ROWS_PER_TABLE = 50_000;

/**
 * Backstop for the run, not the pacing mechanism — MAX_ROWS_PER_TABLE is that.
 * It only matters when the table is behind enough for batches to go cold again,
 * and it stays well inside maxDuration so a run ends by choice rather than by
 * kill, losing whatever the loop had not committed.
 */
const TIME_BUDGET_MS = 240_000;

interface RetentionTarget {
	label: string;
	/** Qualified table name, and the column holding the row's age. */
	relation: SQL;
	receivedAt: SQL;
}

const TARGETS: RetentionTarget[] = [
	{
		label: "webhook_events",
		relation: sql`ingest.webhook_events`,
		receivedAt: sql`received_at`,
	},
	{
		label: "automation_events",
		relation: sql`automation_events`,
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
				WHERE ${target.receivedAt} < now() - ${`${RETAIN_HOURS} hours`}::interval
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
 * Deleting rather than partitioning because each dedup index has to stay as it
 * is — (provider, event_id) on one, (integration_connection_id, provider,
 * external_event_id) on the other: a unique index on a partitioned table must
 * contain the partition key, and adding received_at to it would mean a
 * redelivery no longer conflicts. What makes deletion viable is the window,
 * not the method — at two days a table and its indexes stay in cache, so a
 * batch is index maintenance against warm pages. At thirty days it was not,
 * and each delete cost more than the insert it undid.
 *
 * webhook_payloads needs no equivalent: its rows are keyed by received_at and
 * whole day partitions are dropped, which returns the space outright instead of
 * leaving dead tuples behind.
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

	return Response.json({ retainHours: RETAIN_HOURS, results });
}
