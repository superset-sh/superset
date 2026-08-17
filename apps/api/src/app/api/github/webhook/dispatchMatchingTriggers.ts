import { dbWs } from "@superset/db/client";
import {
	automations,
	automationTriggers,
	userIdentities,
} from "@superset/db/schema";
import {
	githubEventNames,
	type MatchableEvent,
	triggerMatches,
} from "@superset/shared/automation-matching";
import { Client } from "@upstash/qstash";
import { and, eq } from "drizzle-orm";

import { env } from "@/env";
import type { GithubPayload } from "./recordAutomationEvent";

const qstash = new Client({
	token: env.QSTASH_TOKEN,
	baseUrl: env.QSTASH_URL,
});

/**
 * Fields the matcher needs that are not columns on `automation_events` — they
 * only exist inside the payload, and only for some events.
 */
function matchableFrom(
	payload: GithubPayload,
	eventType: string,
	repositoryId: string | null,
	ref: string | null,
): MatchableEvent {
	return {
		eventType,
		repositoryId,
		ref,
		actorId:
			payload.sender?.id !== undefined ? String(payload.sender.id) : null,
		actorLogin: payload.sender?.login ?? null,
		actorIsExternal: null,
		labels: (payload.pull_request?.labels ?? payload.issue?.labels ?? [])
			.map((l) => l?.name)
			.filter((n): n is string => typeof n === "string"),
		body: payload.comment?.body ?? payload.review?.body ?? null,
		isFork: payload.pull_request?.head?.repo?.fork === true,
		// Who opened the thing being commented on, which is a different person
		// from whoever wrote the comment.
		subjectAuthorId: (() => {
			const id =
				payload.pull_request?.user?.id ?? payload.issue?.user?.id ?? undefined;
			return id !== undefined ? String(id) : null;
		})(),
	};
}

/**
 * Finds the triggers an event satisfies and enqueues a run for each.
 *
 * Only automations that are enabled are considered — that toggle is the gate a
 * person actually controls, so an automation someone paused stops firing
 * without needing its triggers disabled one by one.
 */
export async function dispatchMatchingTriggers(params: {
	organizationId: string;
	eventId: string;
	eventType: string;
	repositoryId: string | null;
	ref: string | null;
	payload: GithubPayload;
}): Promise<{ matched: number; considered: number }> {
	const names = githubEventNames({
		eventType: params.eventType,
		isDraft: params.payload.pull_request?.draft === true,
		reviewState: params.payload.review?.state ?? null,
		runConclusion: params.payload.workflow_run?.conclusion ?? null,
		threadResolved: null,
	});
	// Nothing in the product names this delivery, so there is nothing to match.
	if (names.length === 0) return { matched: 0, considered: 0 };

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
				eq(automationTriggers.kind, "github"),
				eq(automationTriggers.enabled, true),
				eq(automations.enabled, true),
			),
		);

	if (candidates.length === 0) return { matched: 0, considered: 0 };

	// Every GitHub identity linked in this org, so `me` can resolve to the
	// automation owner. A person may link more than one account — work and
	// personal — so this is a set per user, not a value.
	const identities = await dbWs
		.select({
			userId: userIdentities.userId,
			externalId: userIdentities.externalId,
		})
		.from(userIdentities)
		.where(
			and(
				eq(userIdentities.organizationId, params.organizationId),
				eq(userIdentities.provider, "github"),
			),
		);
	const githubIdsByUser = new Map<string, string[]>();
	for (const row of identities) {
		const existing = githubIdsByUser.get(row.userId);
		if (existing) existing.push(row.externalId);
		else githubIdsByUser.set(row.userId, [row.externalId]);
	}

	const event = matchableFrom(
		params.payload,
		params.eventType,
		params.repositoryId,
		params.ref,
	);

	const matched = candidates.filter(
		(candidate) =>
			triggerMatches(candidate.config, event, {
				// Resolved per candidate: two automations can watch the same event
				// on behalf of different owners.
				github: {
					names,
					ownerIds: githubIdsByUser.get(candidate.ownerUserId) ?? [],
				},
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
			// One run per trigger per event, however many times GitHub redelivers.
			deduplicationId: `${candidate.triggerId}_${params.eventId}`,
			retries: 2,
			failureCallback: `${env.NEXT_PUBLIC_API_URL}/api/automations/run-failed`,
		})),
	);

	return { matched: matched.length, considered: candidates.length };
}
