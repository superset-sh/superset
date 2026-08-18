import type {
	GithubTriggerEvent,
	TriggerActor,
	TriggerScope,
} from "./automation-triggers";

/**
 * Decides whether a recorded event satisfies a trigger's config.
 *
 * Pure and provider-shaped rather than payload-shaped: it takes the normalized
 * fields `automation_events` already carries, so the same function can be run
 * over historical rows to see what *would* have matched before anything is
 * allowed to dispatch.
 */

/** The normalized event, as recorded. */
export type MatchableEvent = {
	/** Qualified with its action, e.g. `pull_request.opened`. */
	eventType: string;
	repositoryId: string | null;
	ref: string | null;
	/** GitHub's numeric id; what people filters compare against. */
	actorId: string | null;
	/** Display only — a login can be renamed, the id cannot. */
	actorLogin: string | null;
	actorIsExternal: boolean | null;
	labels: string[];
	/** Comment or review body, when the event carries one. */
	body: string | null;
	/** Fork pull requests carry attacker-controlled content into a checkout. */
	isFork: boolean;
	/** Who opened the thing being commented on. */
	subjectAuthorId: string | null;
};

export type MatchResult =
	| { matches: true }
	| { matches: false; reason: string };

const no = (reason: string): MatchResult => ({ matches: false, reason });

/**
 * `null` matches nothing — an unconfigured filter should never fire. That is the
 * opposite of the usual "empty means unrestricted" convention, and deliberate:
 * a half-built trigger silently matching every repository is the worst
 * available failure.
 */
export function scopeAllows(
	scope: TriggerScope,
	value: string | null,
): boolean {
	if (scope === null) return false;
	if (scope.mode === "any") return true;
	if (value === null) return false;
	return scope.ids.includes(value);
}

/** Same, but for filters that are only meaningful on some events. */
export function scopeAllowsAny(scope: TriggerScope, values: string[]): boolean {
	if (scope === null) return false;
	if (scope.mode === "any") return true;
	return values.some((v) => scope.ids.includes(v));
}

/**
 * `ownerIds` is a set: a person may link both a work and a personal account, and
 * a pull request opened from either is still theirs.
 */
export function actorAllows(
	actor: TriggerActor,
	actorId: string | null,
	ownerIds: string[],
): boolean {
	if (actor === "anyone") return true;
	if (actorId === null) return false;
	if (actor === "me") return ownerIds.includes(actorId);
	return actor.ids.includes(actorId);
}

/**
 * The body a filter is tested against is truncated first.
 *
 * A user-supplied pattern runs on the webhook path, and JavaScript's engine
 * backtracks: `^(a+)+$` against a long non-matching body is exponential and
 * would block the event loop. Truncation bounds the exponent; it does not
 * remove it, which is why a linear-time engine is still wanted here.
 */
const MAX_FILTERED_BODY = 4096;

/** Applies a comment filter, treating an invalid regex as no match. */
export function bodyMatches(
	filter: { pattern: string; isRegex: boolean } | null,
	body: string | null,
): boolean {
	if (!filter || filter.pattern === "") return true;
	if (body === null) return false;
	const subject = body.slice(0, MAX_FILTERED_BODY);
	if (!filter.isRegex) {
		return subject.toLowerCase().includes(filter.pattern.toLowerCase());
	}
	try {
		return new RegExp(filter.pattern, "i").test(subject);
	} catch {
		// A trigger whose regex does not compile must not match everything.
		return false;
	}
}

/**
 * Maps a GitHub delivery to the event a trigger names. GitHub's wire events are
 * coarser than the product's: `pull_request.opened` is a draft opening or a
 * normal one depending on a field in the payload.
 */
export function githubEventNames(event: {
	eventType: string;
	isDraft: boolean;
	reviewState: string | null;
	runConclusion: string | null;
	threadResolved: boolean | null;
}): GithubTriggerEvent[] {
	const t = event.eventType;
	switch (t) {
		case "pull_request.opened":
			return event.isDraft ? ["draft_opened"] : ["pull_request.opened"];
		case "pull_request.ready_for_review":
			return ["pull_request.opened"];
		case "pull_request.synchronize":
			return ["pull_request.pushed"];
		case "pull_request.closed":
			return ["pull_request.merged"];
		case "pull_request.labeled":
		case "pull_request.unlabeled":
			return ["label_change"];
		case "push":
			return ["push_to_branch"];
		case "check_suite.completed":
			return ["checks_completed"];
		case "issue_comment.created":
			return ["comment_added", "issue_comment"];
		case "pull_request_review_comment.created":
			return ["pr_review_comment", "comment_added"];
		case "pull_request_review.submitted": {
			const any: GithubTriggerEvent[] = ["pr_review_submitted.any"];
			if (event.reviewState === "approved") {
				any.push("pr_review_submitted.approved");
			}
			if (event.reviewState === "changes_requested") {
				any.push("pr_review_submitted.changes_requested");
			}
			if (event.reviewState === "commented") {
				any.push("pr_review_submitted.commented");
			}
			return any;
		}
		case "pull_request_review_thread.resolved":
			return ["review_thread.resolved", "review_thread.any"];
		case "pull_request_review_thread.unresolved":
			return ["review_thread.unresolved", "review_thread.any"];
		case "workflow_run.completed": {
			const any: GithubTriggerEvent[] = ["workflow_run.any"];
			if (event.runConclusion === "success") any.push("workflow_run.success");
			if (event.runConclusion === "failure") any.push("workflow_run.failure");
			if (event.runConclusion === "cancelled") {
				any.push("workflow_run.cancelled");
			}
			return any;
		}
		default:
			return [];
	}
}

/** Whether a GitHub trigger config accepts this event. */
export function githubTriggerMatches(
	config: {
		event: string;
		repositories: TriggerScope;
		branches: TriggerScope;
		labels: TriggerScope;
		actor: TriggerActor;
		subjectAuthor?: TriggerActor;
		commentFilter?: { pattern: string; isRegex: boolean } | null;
		includeForks: boolean;
	},
	event: MatchableEvent,
	context: { names: GithubTriggerEvent[]; ownerIds: string[] },
): MatchResult {
	if (!context.names.includes(config.event as GithubTriggerEvent)) {
		return no("event");
	}
	if (!scopeAllows(config.repositories, event.repositoryId)) {
		return no("repository");
	}
	// Branches and labels only narrow when configured; null means the trigger
	// author did not choose to filter on them, which for these is "any".
	if (config.branches !== null && !scopeAllows(config.branches, event.ref)) {
		return no("branch");
	}
	if (config.labels !== null && !scopeAllowsAny(config.labels, event.labels)) {
		return no("label");
	}
	if (!actorAllows(config.actor, event.actorId, context.ownerIds)) {
		return no("actor");
	}
	if (
		config.subjectAuthor !== undefined &&
		!actorAllows(config.subjectAuthor, event.subjectAuthorId, context.ownerIds)
	) {
		return no("subjectAuthor");
	}
	if (!config.includeForks && event.isFork) {
		return no("fork");
	}
	if (!bodyMatches(config.commentFilter ?? null, event.body)) {
		return no("commentFilter");
	}
	return { matches: true };
}
