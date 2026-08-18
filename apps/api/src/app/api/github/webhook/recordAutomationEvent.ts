import { db } from "@superset/db/client";
import { automationEvents, githubInstallations } from "@superset/db/schema";
import { eq } from "drizzle-orm";

import { stripNullChars } from "@/lib/strip-null-chars";

/**
 * Records an incoming GitHub delivery as an `automation_events` row.
 *
 * This is the normalized event stream triggers are matched against. It keeps
 * its own copy of the payload because `ingest.webhook_events` is pruned, and
 * flattens the handful of fields matching and prompting actually need out of
 * payloads whose shape differs per event.
 *
 * Recording is deliberately separate from matching: nothing reads these rows
 * yet, so a mistake here shows up as a wrong row rather than an agent running
 * on the wrong pull request.
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
		author_association?: string;
	};
	issue?: {
		number?: number;
		labels?: Array<{ name?: string }>;
		title?: string;
		html_url?: string;
		user?: { id?: number | string; login?: string };
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

export async function recordAutomationEvent(params: {
	eventType: string;
	deliveryId: string;
	payload: unknown;
	webhookEventId: string;
}): Promise<{
	recorded: boolean;
	reason?: string;
	eventId?: string;
	organizationId?: string;
	repositoryId?: string | null;
	ref?: string | null;
}> {
	const payload = params.payload as GithubPayload;

	const installationId = payload.installation?.id;
	if (installationId === undefined) {
		// Pings and a few org-level events carry no installation, so there is no
		// organization to attribute them to.
		return { recorded: false, reason: "no installation" };
	}

	const [installation] = await db
		.select({ organizationId: githubInstallations.organizationId })
		.from(githubInstallations)
		.where(eq(githubInstallations.installationId, String(installationId)))
		.limit(1);

	if (!installation) {
		return { recorded: false, reason: "unknown installation" };
	}

	const qualified = qualifiedEventType(params.eventType, payload);

	const repositoryId =
		payload.repository?.id !== undefined ? String(payload.repository.id) : null;
	const ref = payload.pull_request?.head?.ref ?? payload.ref ?? null;

	const [inserted] = await db
		.insert(automationEvents)
		.values({
			organizationId: installation.organizationId,
			// GitHub installs are their own connection record, not an
			// integration_connections row, so provenance is the delivery below.
			integrationConnectionId: null,
			provider: "github",
			eventType: qualified,
			externalEventId: params.deliveryId,
			resourceKey: resourceKeyFor(payload, params.eventType),
			title: titleFor(payload, params.eventType),
			url: urlFor(payload),
			// The numeric id, not the full name: a repository can be renamed and
			// triggers must keep matching it afterwards.
			repositoryId,
			ref,
			actorLogin: payload.sender?.login ?? null,
			actorIsExternal: actorIsExternalFor(payload),
			// jsonb rejects \u0000, and a payload carrying one would otherwise
			// throw and lose the event.
			payload: stripNullChars(payload) as Record<string, unknown>,
			webhookEventId: params.webhookEventId,
		})
		// A redelivery of the same GitHub delivery id is the same event.
		.onConflictDoNothing({
			target: [
				automationEvents.integrationConnectionId,
				automationEvents.provider,
				automationEvents.externalEventId,
			],
		})
		.returning({ id: automationEvents.id });

	// Empty on a redelivery the dedupe swallowed; the first delivery already
	// dispatched whatever this event matches.
	if (!inserted) return { recorded: false, reason: "duplicate delivery" };

	return {
		recorded: true,
		eventId: inserted.id,
		organizationId: installation.organizationId,
		repositoryId,
		ref,
	};
}
