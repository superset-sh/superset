import { dbWs } from "@superset/db/client";
import { automationEvents } from "@superset/db/schema";
import { and, asc, isNotNull, isNull, lt } from "drizzle-orm";
import { dispatchMatchingTriggers } from "./dispatchMatchingTriggers";

/** Long enough that an in-flight delivery is not mistaken for a stuck one. */
const GRACE_MS = 60_000;
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
	const stuck = await dbWs
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
				lt(automationEvents.receivedAt, new Date(Date.now() - GRACE_MS)),
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
