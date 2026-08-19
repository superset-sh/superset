import {
	type AutomationEventDispatchInput,
	automationEvents,
} from "@superset/db/schema";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { stripNullChars } from "@/lib/strip-null-chars";

export type AutomationEventInput = {
	organizationId: string;
	/** Null for providers with no integration_connections row (webhook, GitHub, Circleback). */
	integrationConnectionId: string | null;
	provider: string;
	eventType: string;
	externalEventId: string;
	resourceKey?: string | null;
	title: string;
	url?: string | null;
	repositoryId?: string | null;
	ref?: string | null;
	actorLogin?: string | null;
	actorIsExternal?: boolean | null;
	payload: unknown;
	webhookEventId?: string | null;
	/**
	 * What matching needs, stored so a failed QStash handoff can be retried by
	 * the sweep. Null when the delivery names no product event: it is kept for
	 * the record and never dispatched.
	 */
	dispatchInput: AutomationEventDispatchInput | null;
};

/**
 * Records one normalized event as an `automation_events` row — the stream
 * every trigger is matched against. Every inbound provider ends here, so the
 * insert, the NUL scrub, and the dedupe exist exactly once.
 *
 * Idempotent on (connection, provider, externalEventId): a redelivery inserts
 * nothing and returns null, and the first delivery already dispatched.
 */
export async function recordAutomationEvent(
	database: PgDatabase<PgQueryResultHKT, Record<string, unknown>>,
	input: AutomationEventInput,
): Promise<{ id: string } | null> {
	const [inserted] = await database
		.insert(automationEvents)
		.values({
			organizationId: input.organizationId,
			integrationConnectionId: input.integrationConnectionId,
			provider: input.provider,
			eventType: input.eventType,
			externalEventId: input.externalEventId,
			resourceKey: input.resourceKey ?? null,
			title: input.title,
			url: input.url ?? null,
			repositoryId: input.repositoryId ?? null,
			ref: input.ref ?? null,
			actorLogin: input.actorLogin ?? null,
			actorIsExternal: input.actorIsExternal ?? null,
			// jsonb rejects U+0000, and a payload carrying one would otherwise
			// throw and lose the event.
			payload: stripNullChars(input.payload) as Record<string, unknown>,
			webhookEventId: input.webhookEventId ?? null,
			dispatchInput: input.dispatchInput,
			// Nothing to dispatch is dispatched.
			dispatchedAt: input.dispatchInput ? null : new Date(),
		})
		.onConflictDoNothing({
			target: [
				automationEvents.integrationConnectionId,
				automationEvents.provider,
				automationEvents.externalEventId,
			],
		})
		.returning({ id: automationEvents.id });
	return inserted ?? null;
}
