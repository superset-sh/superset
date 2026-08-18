import type {
	GithubTriggerEvent,
	TriggerActor,
	TriggerScope,
} from "../automation-triggers";
import {
	actorAllows,
	type BaseMatchableEvent,
	bodyMatches,
	type MatchContext,
	type MatchResult,
	scopeAllows,
	scopeAllowsAny,
} from "./core";

/** A GitHub delivery, normalized to what GitHub triggers filter on. */
export type GithubMatchableEvent = BaseMatchableEvent & {
	provider: "github";
	repositoryId: string | null;
	ref: string | null;
	actorIsExternal: boolean | null;
	labels: string[];
	/** Fork pull requests carry attacker-controlled content into a checkout. */
	isFork: boolean;
	/** Who opened the thing being commented on. */
	subjectAuthorId: string | null;
	/** The product-level names this delivery maps to; see githubEventNames. */
	names: GithubTriggerEvent[];
};

const no = (reason: string): MatchResult => ({ matches: false, reason });

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
	event: GithubMatchableEvent,
	context: MatchContext,
): MatchResult {
	if (!event.names.includes(config.event as GithubTriggerEvent)) {
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
