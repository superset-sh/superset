import {
	type GithubMatchableEvent,
	githubEventNames,
} from "@superset/shared/automation-matching";
import { dispatchMatchingTriggers as dispatch } from "@/lib/automations/dispatchMatchingTriggers";
import type { GithubPayload } from "./recordAutomationEvent";

/**
 * Normalizes a GitHub delivery into what GitHub triggers filter on. Every
 * field here exists only inside the payload, and only for some events — the
 * columns on `automation_events` are what every provider shares; this is what
 * GitHub adds.
 */
function matchableFrom(
	payload: GithubPayload,
	eventType: string,
	repositoryId: string | null,
	ref: string | null,
): GithubMatchableEvent {
	return {
		provider: "github",
		eventType,
		names: githubEventNames({
			eventType,
			isDraft: payload.pull_request?.draft === true,
			reviewState: payload.review?.state ?? null,
			runConclusion: payload.workflow_run?.conclusion ?? null,
			threadResolved: null,
		}),
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
 * GitHub's entry into the shared dispatcher: normalize, then hand off. The
 * candidate query, identity lookup and QStash publish live in
 * `@/lib/automations/dispatchMatchingTriggers`, once, for every provider.
 */
export async function dispatchMatchingTriggers(params: {
	organizationId: string;
	eventId: string;
	eventType: string;
	repositoryId: string | null;
	ref: string | null;
	payload: GithubPayload;
}): Promise<{ matched: number; considered: number }> {
	const event = matchableFrom(
		params.payload,
		params.eventType,
		params.repositoryId,
		params.ref,
	);
	// Nothing in the product names this delivery, so there is nothing to match.
	if (event.names.length === 0) return { matched: 0, considered: 0 };

	return dispatch({
		organizationId: params.organizationId,
		eventId: params.eventId,
		event,
	});
}
