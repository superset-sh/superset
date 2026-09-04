import { dbWs } from "@superset/db/client";
import { sql } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";

export type SingleFlightResult<T> = { ran: true; result: T } | { ran: false };

/**
 * Runs `fn` under a job-scoped advisory lock, or reports `ran: false` without
 * running it when another invocation already holds the lock.
 *
 * QStash fires the periodic job routes on a fixed cadence with no regard for
 * whether the previous tick finished, and each of these jobs costs more per
 * batch than its cadence, so left alone they stack: on 2026-09-02 production
 * had 24 copies of the redispatch sweep, 6 of the payload pruner and 4 of the
 * retention job running at once, every one pinning a backend for minutes.
 *
 * The lock is transaction-scoped, so a function the platform kills mid-batch
 * releases it as soon as Postgres rolls that transaction back. Batch work
 * should run on the transaction handed to `fn`, which keeps the lock and the
 * statement on one connection.
 *
 * Batch jobs take the lock per batch rather than around their whole loop.
 * That keeps each batch transaction short, which is what their batch sizes
 * were chosen for, and still bounds the job to one batch in flight: a
 * second invocation that lands between two batches wins the next lock, and
 * the first then sees `ran: false` on its own next attempt and exits. One
 * runner either way, never two.
 */
export async function singleFlight<T>(
	job: string,
	// biome-ignore lint/suspicious/noExplicitAny: Transaction type varies by client (Neon, PostgresJs, etc)
	fn: (tx: PgTransaction<any, any, any>) => Promise<T>,
): Promise<SingleFlightResult<T>> {
	return dbWs.transaction(async (tx) => {
		const { rows } = await tx.execute<{ locked: boolean }>(
			sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${`job:${job}`}::text, 0)) AS locked`,
		);
		if (!rows[0]?.locked) return { ran: false };
		return { ran: true, result: await fn(tx) };
	});
}
