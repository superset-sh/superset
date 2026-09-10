import {
	type GithubMatchableEvent,
	githubEventNames,
} from "@superset/shared/automation-matching";

import type { NormalizedDelivery } from "@/lib/automations/ingestAutomationEvent";

/**
 * Normalizes a GitHub delivery into the `automation_events` row triggers are
 * matched against. It keeps its own copy of the payload because
 * `ingest.webhook_events` is pruned, and flattens the handful of fields
 * matching and prompting actually need out of payloads whose shape differs
 * per event.
 */

export type GithubPayload = {
	action?: string;
	installation?: { id?: number | string };
	repository?: { id?: number | string; full_name?: string };
	sender?: { id?: number | string; login?: string; type?: string };
	// GitHub's own membership signal, present on comment, PR and review
	// payloads. The only trustworthy source for "is this person one of us".
	author_association?: string;
	pull_request?: {
		number?: number;
		labels?: Array<{ name?: string }>;
		title?: string;
		html_url?: string;
		head?: { ref?: string; repo?: { fork?: boolean } };
		user?: { id?: number | string; login?: string };
		draft?: boolean;
		merged?: boolean;
		author_association?: string;
	};
	issue?: {
		number?: number;
		labels?: Array<{ name?: string }>;
		title?: string;
		html_url?: string;
		user?: { id?: number | string; login?: string };
		// Present when the "issue" is a pull request.
		pull_request?: { url?: string };
	};
	comment?: {
		body?: string;
		html_url?: string;
		user?: { login?: string };
		author_association?: string;
	};
	review?: {
		state?: string;
		body?: string;
		html_url?: string;
		user?: { login?: string };
	};
	// `pull_request.assigned` names the assignee; `review_requested` names the
	// reviewer, or only a `requested_team` when a team was asked.
	assignee?: { id?: number | string; login?: string } | null;
	requested_reviewer?: { id?: number | string; login?: string } | null;
	ref?: string;
	workflow_run?: { conclusion?: string; html_url?: string; name?: string };
	check_suite?: { conclusion?: string };
	label?: { name?: string };
};

/**
 * The subject a run would act on — a pull request, an issue, a branch. Runs key
 * debounce and in-flight limits off this, so two comments on one PR are the
 * same resource rather than two.
 */
export function resourceKeyFor(
	payload: GithubPayload,
	eventType: string,
): string | null {
	// The numeric id for the same reason as repositoryId: a rename must not
	// change the key, or an in-flight run stops matching its own subject.
	const repo =
		payload.repository?.id !== undefined
			? String(payload.repository.id)
			: undefined;
	if (!repo) return null;
	const pr = payload.pull_request?.number ?? payload.issue?.number;
	if (pr !== undefined) return `github:${repo}#${pr}`;
	if (eventType === "push" && payload.ref) {
		return `github:${repo}@${payload.ref}`;
	}
	return `github:${repo}`;
}

export function titleFor(payload: GithubPayload, eventType: string): string {
	const subject = payload.pull_request?.title ?? payload.issue?.title;
	if (subject) return subject;
	if (payload.workflow_run?.name) return payload.workflow_run.name;
	if (eventType === "push" && payload.ref) return payload.ref;
	return payload.repository?.full_name ?? eventType;
}

/**
 * Whether the actor is outside the repository's circle of trust.
 *
 * Derived from GitHub's `author_association`, which is the only field that
 * actually states membership. `sender.type` does not: it distinguishes a bot
 * from a human, and would mark a genuine outside contributor as internal.
 * Null when no payload on this event carries the association.
 */
export function actorIsExternalFor(payload: GithubPayload): boolean | null {
	const association =
		payload.comment?.author_association ??
		payload.pull_request?.author_association ??
		payload.author_association;
	if (!association) return null;
	return !["OWNER", "MEMBER", "COLLABORATOR"].includes(association);
}

/**
 * `action` is what distinguishes opened from closed from labeled; the bare
 * event name is too coarse to match on.
 */
export function qualifiedEventType(
	eventType: string,
	payload: GithubPayload,
): string {
	return payload.action ? `${eventType}.${payload.action}` : eventType;
}

export function urlFor(payload: GithubPayload): string | null {
	return (
		payload.comment?.html_url ??
		payload.review?.html_url ??
		payload.pull_request?.html_url ??
		payload.issue?.html_url ??
		payload.workflow_run?.html_url ??
		null
	);
}

/**
 * What GitHub triggers filter on. Every field here exists only inside the
 * payload, and only for some events — the columns on `automation_events` are
 * what every provider shares; this is what GitHub adds.
 */
export function matchableFrom(
	payload: GithubPayload,
	eventType: string,
	repositoryId: string | null,
	ref: string | null,
): GithubMatchableEvent {
	const assignee = payload.assignee ?? payload.requested_reviewer ?? null;
	return {
		provider: "github",
		eventType,
		names: githubEventNames({
			eventType,
			isDraft: payload.pull_request?.draft === true,
			isMerged: payload.pull_request?.merged === true,
			isPullRequestComment: payload.issue?.pull_request !== undefined,
			reviewState: payload.review?.state ?? null,
			runConclusion: payload.workflow_run?.conclusion ?? null,
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
		// Only PR-shaped payloads carry the head repo; an issue_comment on a fork
		// PR cannot be told apart and is treated as not a fork.
		isFork: payload.pull_request?.head?.repo?.fork === true,
		// Who opened the thing being commented on, which is a different person
		// from whoever wrote the comment.
		subjectAuthorId: (() => {
			const id =
				payload.pull_request?.user?.id ?? payload.issue?.user?.id ?? undefined;
			return id !== undefined ? String(id) : null;
		})(),
		subjectAuthorLogin:
			payload.pull_request?.user?.login ?? payload.issue?.user?.login ?? null,
		assigneeId: assignee?.id !== undefined ? String(assignee.id) : null,
		assigneeLogin: assignee?.login ?? null,
	};
}

export function normalizeGithubDelivery(params: {
	organizationId: string;
	eventType: string;
	deliveryId: string;
	payload: GithubPayload;
	webhookEventId: string;
}): NormalizedDelivery {
	const { payload } = params;
	const eventType = qualifiedEventType(params.eventType, payload);
	// The numeric id, not the full name: a repository can be renamed and
	// triggers must keep matching it afterwards.
	const repositoryId =
		payload.repository?.id !== undefined ? String(payload.repository.id) : null;
	const ref = payload.pull_request?.head?.ref ?? payload.ref ?? null;
	const event = matchableFrom(payload, eventType, repositoryId, ref);

	return {
		event: {
			organizationId: params.organizationId,
			// GitHub installs are their own connection record, not an
			// integration_connections row, so provenance is the delivery below.
			integrationConnectionId: null,
			provider: "github",
			eventType,
			// A redelivery of the same GitHub delivery id is the same event.
			externalEventId: params.deliveryId,
			resourceKey: resourceKeyFor(payload, params.eventType),
			title: titleFor(payload, params.eventType),
			url: urlFor(payload),
			repositoryId,
			ref,
			actorLogin: payload.sender?.login ?? null,
			actorIsExternal: actorIsExternalFor(payload),
			payload,
			webhookEventId: params.webhookEventId,
		},
		// An action nothing in the product names is recorded, never matched.
		dispatch: event.names.length > 0 ? { event } : null,
	};
}
