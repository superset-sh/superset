import { dbWs } from "@superset/db/client";
import {
	automations,
	automationTriggers,
	userIdentities,
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
 * `MatchableEvent`, whose `provider` selects both the trigger kind to consider
 * and the identity provider `me` resolves through. Every inbound route —
 * GitHub, Slack, Linear, a raw webhook — ends in this one function, so the
 * candidate query, the owner-identity lookup, and the QStash publish exist
 * exactly once.
 *
 * Only automations that are enabled are considered — that toggle is the gate a
 * person actually controls, so an automation someone paused stops firing
 * without needing its triggers disabled one by one.
 */
export async function dispatchMatchingTriggers(params: {
	organizationId: string;
	eventId: string;
	event: MatchableEvent;
}): Promise<{ matched: number; considered: number }> {
	const { event } = params;

	const candidates = await dbWs
		.select({
			triggerId: automationTriggers.id,
			config: automationTriggers.config,
			automationId: automations.id,
			ownerUserId: automations.ownerUserId,
		})
		.from(automationTriggers)
		.innerJoin(automations, eq(automations.id, automationTriggers.automationId))
		.where(
			and(
				eq(automationTriggers.organizationId, params.organizationId),
				// The kind enum and the provider discriminant share values by
				// construction; a provider whose kind name differed would need a
				// map here, and none does.
				eq(automationTriggers.kind, event.provider as never),
				eq(automationTriggers.enabled, true),
				eq(automations.enabled, true),
			),
		);

	if (candidates.length === 0) return { matched: 0, considered: 0 };

	// Every identity linked in this org for this provider, so `me` can resolve
	// to the automation owner. A person may link more than one account — work
	// and personal — so this is a set per user, not a value.
	const identities = await dbWs
		.select({
			userId: userIdentities.userId,
			externalId: userIdentities.externalId,
		})
		.from(userIdentities)
		.where(
			and(
				eq(userIdentities.organizationId, params.organizationId),
				eq(userIdentities.provider, event.provider),
			),
		);
	const idsByUser = new Map<string, string[]>();
	for (const row of identities) {
		const existing = idsByUser.get(row.userId);
		if (existing) existing.push(row.externalId);
		else idsByUser.set(row.userId, [row.externalId]);
	}

	const matched = candidates.filter(
		(candidate) =>
			triggerMatches(candidate.config, event, {
				// Resolved per candidate: two automations can watch the same event
				// on behalf of different owners.
				ownerIds: idsByUser.get(candidate.ownerUserId) ?? [],
			}).matches,
	);

	if (matched.length === 0) {
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

	return { matched: matched.length, considered: candidates.length };
}
