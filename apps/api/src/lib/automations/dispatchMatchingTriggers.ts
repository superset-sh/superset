import { db } from "@superset/db/client";
import {
	automationEvents,
	automations,
	automationTriggers,
	subscriptions,
} from "@superset/db/schema";
import { findProviderIdentity } from "@superset/db/utils";
import {
	configHasMeScope,
	type MatchableEvent,
	resolveMeScopes,
	triggerMatches,
} from "@superset/shared/automation-matching";
import {
	ACTIVE_SUBSCRIPTION_STATUSES,
	type PlanTier,
	planAllowsTriggerKind,
	requiredPlanForTriggerKind,
} from "@superset/shared/billing";
import { Client } from "@upstash/qstash";
import { and, desc, eq, inArray } from "drizzle-orm";
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

	// Tier gate, same map the editor badges from: a downgraded org's triggers
	// stay configured and editable, they just never fire. The event is still
	// marked dispatched — it was handled, by being declined.
	if (requiredPlanForTriggerKind(event.provider) !== undefined) {
		const plan = await organizationPlan(params.organizationId);
		if (!planAllowsTriggerKind(plan, event.provider)) {
			await markDispatched(params.eventId);
			return { matched: 0, considered: 0 };
		}
	}

	const candidates = await db
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

	// "Me" scopes resolve to the automation owner's identity at the event's
	// provider NOW, not the identity they had when the trigger was written —
	// reconnecting a different account moves every "Me" trigger with it. One
	// lookup per owner per event, and only for configs that carry the mode.
	const meIds = new Map<string, Promise<string | null>>();
	const meIdFor = (ownerUserId: string) => {
		// The promise is what's cached — the candidates resolve concurrently,
		// and a value cache would miss for every one of them.
		let pending = meIds.get(ownerUserId);
		if (!pending) {
			pending = findProviderIdentity({
				organizationId: params.organizationId,
				userId: ownerUserId,
				provider: event.provider,
			}).then((identity) => identity?.externalId ?? null);
			meIds.set(ownerUserId, pending);
		}
		return pending;
	};
	const resolved = await Promise.all(
		candidates.map(async (candidate) => {
			if (!configHasMeScope(candidate.config)) return candidate;
			const meId = await meIdFor(candidate.ownerUserId);
			return { ...candidate, config: resolveMeScopes(candidate.config, meId) };
		}),
	);

	const matched = resolved.filter(
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
 * The org's plan as billing.activePlan resolves it: the newest subscription
 * in a paying status, else free. Unrecognized plan names read as free — the
 * gate must fail closed on a plan string this build doesn't know.
 */
async function organizationPlan(organizationId: string): Promise<PlanTier> {
	const [subscription] = await db
		.select({ plan: subscriptions.plan })
		.from(subscriptions)
		.where(
			and(
				eq(subscriptions.referenceId, organizationId),
				inArray(subscriptions.status, [...ACTIVE_SUBSCRIPTION_STATUSES]),
			),
		)
		.orderBy(desc(subscriptions.createdAt))
		.limit(1);
	const plan = subscription?.plan;
	return plan === "pro" || plan === "enterprise" ? plan : "free";
}

/**
 * The handoff to QStash is the one step that cannot be retried by the sender
 * or by QStash itself, so the row records that it happened. Rows left
 * unmarked are picked up by the re-dispatch sweep.
 */
async function markDispatched(eventId: string) {
	await db
		.update(automationEvents)
		.set({ dispatchedAt: new Date() })
		.where(eq(automationEvents.id, eventId));
}
