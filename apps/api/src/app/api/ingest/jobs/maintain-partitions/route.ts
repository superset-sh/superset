import { db } from "@superset/db/client";
import { sql } from "drizzle-orm";

import { verifyQstashRequest } from "@/lib/verifyQstash";

export const dynamic = "force-dynamic";

/** Runway. Long enough that a few days of failed runs cannot strand inserts. */
const DAYS_AHEAD = 14;

/** Matches the payload window the ingest pruner uses. */
const RETAIN_DAYS = 7;

/**
 * Keeps ingest.webhook_payloads partitioned ahead of the writes and drops what
 * has aged out. Dropping is the point: it returns the space immediately, where
 * the UPDATE-based pruning it replaces leaves dead tuples that only a rewrite
 * reclaims.
 *
 * Runs daily. A missed day is harmless against a 14-day runway; a fortnight of
 * missed days is not, which is what `defaultRows` reports on.
 */
export async function POST(request: Request): Promise<Response> {
	const body = await request.text();
	const rejected = await verifyQstashRequest(
		request,
		body,
		"/api/ingest/jobs/maintain-partitions",
	);
	if (rejected) return rejected;

	// Counted before maintenance, not after. Rows here mean a delivery landed on
	// a day with no partition, and creating that day's partition then fails with
	// "would be violated by some row" — so reading this afterwards would skip
	// the one diagnostic that explains the failure.
	//
	// null means the count itself failed. Reporting 0 there would read as "the
	// default partition is empty", which is the opposite of what is known.
	let defaultRows: number | null = null;
	try {
		const [row] = (
			await db.execute(sql`
				SELECT count(*)::int AS n FROM ingest.webhook_payloads_default
			`)
		).rows as Array<{ n: number }>;
		defaultRows = row?.n ?? 0;
	} catch (error) {
		console.error(
			"[ingest/maintain-partitions] could not read the default partition:",
			error,
		);
	}
	if (defaultRows !== null && defaultRows > 0) {
		console.error(
			`[ingest/maintain-partitions] webhook_payloads_default holds ${defaultRows} rows; partition creation for those days will fail until they are drained`,
		);
	}

	let changes: Array<{ action: string; partition_name: string }>;
	try {
		const result = await db.execute(sql`
			SELECT action, partition_name
			FROM ingest.maintain_webhook_payload_partitions(${DAYS_AHEAD}, ${RETAIN_DAYS})
		`);
		changes = result.rows as Array<{ action: string; partition_name: string }>;
	} catch (error) {
		console.error("[ingest/maintain-partitions] maintenance failed:", error);
		return Response.json(
			{
				error: "Partition maintenance failed",
				// The likely cause, and the thing to act on.
				defaultRows,
			},
			{ status: 500 },
		);
	}

	return Response.json({
		created: changes.filter((c) => c.action === "created").length,
		dropped: changes.filter((c) => c.action === "dropped").length,
		partitions: changes,
		defaultRows,
	});
}
