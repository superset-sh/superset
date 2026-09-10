import { automationEvents } from "@superset/db/schema";
import { and, asc, gt, isNotNull, isNull, lt } from "drizzle-orm";
import type { SingleFlightTx } from "@/lib/singleFlight";
import { dispatchMatchingTriggers } from "./dispatchMatchingTriggers";

/** Long enough that an in-flight delivery is not mistaken for a stuck one. */
const GRACE_MS = 60_000;
/**
 * How far back the sweep looks. Two reasons it is bounded.
 *
 * Rows recorded before #6635 (2026-08-18) with nothing to dispatch were never
 * marked, so about 1.2M of them sit at the left edge of the undispatched
 * index forever. An unbounded sweep walks all of them, cold, on every tick
 * before it reaches a row it can act on; in production that took four minutes
 * a run and stacked two dozen runs deep. The bound turns the scan into a
 * range that starts after them.
 *
 * It is also the retry ceiling. The sweep exists to retry a handoff that
 * failed minutes ago; a run fired for a day-old event is worse than no run.
 */
const LOOKBACK_MS = 24 * 60 * 60 * 1000;
const BATCH_SIZE = 200;

/**
 * How long the row loop may run before it leaves the rest to the next tick.
 *
 * This is what keeps the batch a batch. `singleFlight` holds its advisory lock
 * in a transaction on `tx`, and every row here costs a publish that runs off
 * that connection, so the connection sits `idle in transaction` for as long as
 * this loop does. Postgres closes it at five minutes and drops the lock with
 * it, mid-sweep, which is how a full 200-row batch took the guard down and
 * left the commit talking to a dead socket. A minute is the same ceiling the
 * Linear sweep publishes under, and leaves five times the headroom.
 */
const TIME_BUDGET_MS = 60_000;

/**
 * Retries the one step neither the sender nor QStash retries: the handoff
 * from a recorded event to QStash. Rows past the grace period with no
 * `dispatchedAt` are re-run through the dispatcher from their stored input;
 * `dispatchMatchingTriggers` marks them once the publish succeeds, and QStash
 * dedupes on trigger+event so a row that half-published does not double-run.
 *
 * Runs on the caller's `singleFlight` transaction and within a time budget, so
 * the lock it holds cannot outlive the idle-in-transaction timeout. Stopping
 * early is safe at any point: a row is marked only once its publish lands, so
 * whatever this run did not reach is still unmarked and still stuck, and the
 * next tick selects it again.
 */
export async function redispatchUndispatched(tx: SingleFlightTx): Promise<{
	attempted: number;
	failed: number;
	more: boolean;
}> {
	const startedAt = Date.now();
	const stuck = await tx
		.select({
			id: automationEvents.id,
			organizationId: automationEvents.organizationId,
			dispatchInput: automationEvents.dispatchInput,
		})
		.from(automationEvents)
		.where(
			and(
				isNull(automationEvents.dispatchedAt),
				isNotNull(automationEvents.dispatchInput),
				gt(automationEvents.receivedAt, new Date(startedAt - LOOKBACK_MS)),
				lt(automationEvents.receivedAt, new Date(startedAt - GRACE_MS)),
			),
		)
		.orderBy(asc(automationEvents.receivedAt))
		.limit(BATCH_SIZE);

	let attempted = 0;
	let failed = 0;
	for (const row of stuck) {
		if (Date.now() - startedAt >= TIME_BUDGET_MS) break;
		attempted++;
		if (!row.dispatchInput) continue;
		try {
			await dispatchMatchingTriggers({
				organizationId: row.organizationId,
				eventId: row.id,
				event: row.dispatchInput.event,
				automationId: row.dispatchInput.automationId,
				triggerId: row.dispatchInput.triggerId,
				ownerUserId: row.dispatchInput.ownerUserId,
			});
		} catch (error) {
			failed++;
			console.error(`[automations/redispatch] event ${row.id} failed:`, error);
		}
	}
	// Whether the run stopped on a limit rather than running out of work.
	return {
		attempted,
		failed,
		more: attempted < stuck.length || stuck.length === BATCH_SIZE,
	};
}
