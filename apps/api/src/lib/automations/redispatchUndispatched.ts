import { db } from "@superset/db/client";
import { automationEvents } from "@superset/db/schema";
import { and, asc, gt, isNotNull, isNull, lt } from "drizzle-orm";
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
 * Retries the one step neither the sender nor QStash retries: the handoff
 * from a recorded event to QStash. Rows past the grace period with no
 * `dispatchedAt` are re-run through the dispatcher from their stored input;
 * `dispatchMatchingTriggers` marks them once the publish succeeds, and QStash
 * dedupes on trigger+event so a row that half-published does not double-run.
 */
export async function redispatchUndispatched(): Promise<{
	attempted: number;
	failed: number;
}> {
	const now = Date.now();
	const stuck = await db
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
				gt(automationEvents.receivedAt, new Date(now - LOOKBACK_MS)),
				lt(automationEvents.receivedAt, new Date(now - GRACE_MS)),
			),
		)
		.orderBy(asc(automationEvents.receivedAt))
		.limit(BATCH_SIZE);

	let failed = 0;
	for (const row of stuck) {
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
	return { attempted: stuck.length, failed };
}
