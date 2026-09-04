import type { GithubTriggerEvent, TriggerScope } from "../automation-triggers";
import {
	type BaseMatchableEvent,
	bodyMatches,
	type MatchResult,
	no,
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
	/** Their login, for the same reason actorLogin exists on people filters. */
	subjectAuthorLogin: string | null;
	/**
	 * Who was put on the pull request — assigned, or asked to review. Null when
	 * a team was asked: GitHub names the team and nobody in it.
	 */
	assigneeId: string | null;
	assigneeLogin: string | null;
	/** The product-level names this delivery maps to; see githubEventNames. */
	names: GithubTriggerEvent[];
};

/**
 * Maps a GitHub delivery to the event a trigger names. GitHub's wire events are
 * coarser than the product's: `pull_request.opened` is a draft opening or a
 * normal one depending on a field in the payload.
 */
export function githubEventNames(event: {
	eventType: string;
	isDraft: boolean;
	isMerged: boolean;
	/** `issue_comment` fires for PR comments too; GitHub marks those on the issue. */
	isPullRequestComment: boolean;
	reviewState: string | null;
	runConclusion: string | null;
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
			// Closed without merging names nothing; there is no closed trigger.
			return event.isMerged ? ["pull_request.merged"] : [];
		case "pull_request.labeled":
		case "pull_request.unlabeled":
			return ["label_change"];
		// One delivery per person put on the PR, each naming that person.
		case "pull_request.assigned":
			return ["pull_request.assigned"];
		case "pull_request.review_requested":
			return ["pull_request.review_requested"];
		case "push":
			return ["push_to_branch"];
		case "check_suite.completed":
			return ["checks_completed"];
		case "issue_comment.created":
			return event.isPullRequestComment ? ["comment_added"] : ["issue_comment"];
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
/** The values a people filter may name someone by, absent ones dropped. */
const people = (id: string | null, login: string | null): string[] =>
	[id, login].filter((value): value is string => value !== null);

export function githubTriggerMatches(
	config: {
		event: string;
		repositories: TriggerScope;
		branches: TriggerScope;
		labels: TriggerScope;
		actor: TriggerScope;
		subjectAuthor?: TriggerScope;
		assignee?: TriggerScope;
		commentFilter?: { pattern: string; isRegex: boolean } | null;
		includeForks: boolean;
	},
	event: GithubMatchableEvent,
): MatchResult {
	if (!event.names.includes(config.event as GithubTriggerEvent)) {
		return no("event");
	}
	if (!scopeAllows(config.repositories, event.repositoryId)) {
		return no("repository");
	}
	if (!scopeAllows(config.branches, event.ref)) {
		return no("branch");
	}
	if (!scopeAllowsAny(config.labels, event.labels)) {
		return no("label");
	}
	// Id or login: the roster saves GitHub's numeric id, but the roster is empty
	// without the members permission, so people filters also accept a username
	// someone typed. Only the id survives a rename — see UserScopeChip.
	if (!scopeAllowsAny(config.actor, people(event.actorId, event.actorLogin))) {
		return no("actor");
	}
	if (
		config.subjectAuthor !== undefined &&
		!scopeAllowsAny(
			config.subjectAuthor,
			people(event.subjectAuthorId, event.subjectAuthorLogin),
		)
	) {
		return no("subjectAuthor");
	}
	// A team review request names the team and nobody in it, so this list is
	// empty for one. That is deliberately not the same as refusing it outright:
	// `{mode:"any"}` reads as "every review request in this repository" and a
	// team request is one, while a named person — which is what "Me" resolves
	// to before it reaches here — cannot match an empty list, so a request
	// aimed at a whole team never fires as though it named an individual.
	if (
		config.assignee !== undefined &&
		!scopeAllowsAny(
			config.assignee,
			people(event.assigneeId, event.assigneeLogin),
		)
	) {
		return no("assignee");
	}
	if (!config.includeForks && event.isFork) {
		return no("fork");
	}
	if (!bodyMatches(config.commentFilter ?? null, event.body)) {
		return no("commentFilter");
	}
	return { matches: true };
}
