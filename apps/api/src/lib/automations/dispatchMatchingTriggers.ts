import { dbWs } from "@superset/db/client";
import {
	automationEvents,
	automations,
	automationTriggers,
} from "@superset/db/schema";
import {
	type MatchableEvent,
	triggerMatches,
} from "@superset/shared/automation-matching";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";
import { env } from "@/env";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});

/**
 * Finds the triggers an event satisfies and enqueues a run for each.
 *
 * Provider-agnostic: the caller has already normalized its payload into a
 * `MatchableEvent`, whose `provider` selects the trigger kind to consider.
 * Every inbound route — GitHub, Slack, Linear, a raw webhook — ends in this
 * one function, so the candidate query and the QStash publish exist exactly
 * once.
 *
 * Only automations that are enabled are considered — that toggle is the gate a
 * person actually controls, so an automation someone paused stops firing
 * without needing its triggers disabled one by one.
 */
export async function dispatchMatchingTriggers(params: {
	organizationId: string;
	eventId: string;
	event: MatchableEvent;
	/**
	 * Restrict candidates. Provider webhooks fan out across the org because
	 * the provider does not know which automation cares. Two kinds of inbound
	 * URL are narrower than that and must not fan out:
	 * - a raw webhook is addressed to one AUTOMATION by URL → `automationId`
	 * - a Circleback webhook is addressed to one TRIGGER by URL → `triggerId`
	 * Without the narrowing, one automation holding two triggers of that kind
	 * with overlapping filters would run once per URL.
	 */
	automationId?: string;
	triggerId?: string;
	/**
	 * Restrict candidates to one member's automations. This is the per-user
	 * isolation for providers whose connection is per member: a Google
	 * connection is one person's calendar and mailbox, and without this
	 * narrowing their events would match every org member's triggers.
	 */
	ownerUserId?: string;
}): Promise<{ matched: number; considered: number }> {
	const { event } = params;

	const candidates = await dbWs
		.select({
			triggerId: automationTriggers.id,
			config: automationTriggers.config,
			automationId: automations.id,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.organizationId, params.organizationId),
				// The kind enum and the provider discriminant share values by
				// construction; a provider whose kind name differed would need a
				// map here, and none does.
				eq(automationTriggers.kind, event.provider),
				eq(automations.enabled, true),
				params.automationId
					? eq(automations.id, params.automationId)
					: undefined,
				params.triggerId
					? eq(automationTriggers.id, params.triggerId)
					: undefined,
				params.ownerUserId
					? eq(automations.ownerUserId, params.ownerUserId)
					: undefined,
			),
		);

	if (candidates.length === 0) {
		// Done, not stuck: without the mark the sweep would retry it forever.
		await markDispatched(params.eventId);
		return { matched: 0, considered: 0 };
	}

	const matched = candidates.filter(
		(candidate) => triggerMatches(candidate.config, event).matches,
	);

	if (matched.length === 0) {
		await markDispatched(params.eventId);
		return { matched: 0, considered: candidates.length };
	}

	await qstash.batchJSON(
		matched.map((candidate) => ({
			url: `${env.NEXT_PUBLIC_API_URL}/api/automations/dispatch/${candidate.automationId}`,
			body: {
				automationId: candidate.automationId,
				triggerId: candidate.triggerId,
				eventId: params.eventId,
			},
			// One run per trigger per event, however many times the provider
			// redelivers.
			deduplicationId: `${candidate.triggerId}_${params.eventId}`,
			retries: 2,
			failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
		})),
	);

	await markDispatched(params.eventId);
	return { matched: matched.length, considered: candidates.length };
}

/**
 * The handoff to QStash is the one step that cannot be retried by the sender
 * or by QStash itself, so the row records that it happened. Rows left
 * unmarked are picked up by the re-dispatch sweep.
 */
async function markDispatched(eventId: string) {
	await dbWs
		.update(automationEvents)
		.set({ dispatchedAt: new Date() })
		.where(eq(automationEvents.id, eventId));
}
