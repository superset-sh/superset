import type { AutomationEventDispatchInput } from "@superset/db/schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { dispatchMatchingTriggers } from "./dispatchMatchingTriggers";
import {
	type AutomationEventInput,
	recordAutomationEvent,
} from "./recordAutomationEvent";

/**
 * One provider delivery, normalized: the row to record and, when the delivery
 * names a product event, what the dispatcher matches against. A delivery that
 * names nothing (an action no trigger exists for) is recorded and never
 * dispatched.
 */
export type NormalizedDelivery =
	| {
			event: Omit<AutomationEventInput, "dispatchInput">;
			dispatch: AutomationEventDispatchInput | null;
	  }
	/**
	 * A delivery the provider could not turn into an event for a permanent
	 * reason (revoked token, entity not shared with the integration). Nothing
	 * is recorded and the sender is acknowledged; a retry would fail the same
	 * way. Transient failures throw instead, so the sender retries.
	 */
	| { skip: string };

export type IngestOutcome =
	| { status: "skipped"; reason: string }
	| { status: "duplicate" }
	| { status: "recorded"; eventId: string }
	| {
			status: "dispatched";
			eventId: string;
			matched: number;
			considered: number;
	  }
	| { status: "dispatch_failed"; eventId: string };

/**
 * The write-and-trigger half every provider shares: record the event, hand
 * the matching runs to QStash. A duplicate delivery records nothing and
 * dispatches nothing — the first delivery did. A failed handoff leaves the
 * row unmarked for the re-dispatch sweep and reports it; the route should
 * still acknowledge the delivery, since a redelivery would only dedupe.
 */
export async function ingestAutomationEvent(
	database: PgDatabase<PgQueryResultHKT, Record<string, unknown>>,
	delivery: NormalizedDelivery,
): Promise<IngestOutcome> {
	if ("skip" in delivery) return { status: "skipped", reason: delivery.skip };
	const inserted = await recordAutomationEvent(database, {
		...delivery.event,
		dispatchInput: delivery.dispatch,
	});
	if (!inserted) return { status: "duplicate" };
	if (!delivery.dispatch) return { status: "recorded", eventId: inserted.id };

	try {
		const result = await dispatchMatchingTriggers({
			organizationId: delivery.event.organizationId,
			eventId: inserted.id,
			event: delivery.dispatch.event,
			automationId: delivery.dispatch.automationId,
			triggerId: delivery.dispatch.triggerId,
			ownerUserId: delivery.dispatch.ownerUserId,
		});
		return { status: "dispatched", eventId: inserted.id, ...result };
	} catch (error) {
		console.error(
			`[automations] dispatch failed for event ${inserted.id}; left for the sweep:`,
			error,
		);
		return { status: "dispatch_failed", eventId: inserted.id };
	}
}
