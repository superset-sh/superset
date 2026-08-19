import type {
	GithubTriggerEvent,
	TriggerConfigInput,
} from "@superset/shared/automation-triggers";
import type { TriggerMenuEntry } from "../types";

export type GithubConfig = Extract<TriggerConfigInput, { kind: "github" }>;

/**
 * The sentence a GitHub trigger reads as.
 *
 * Each event names its own words and its own slots, because the filters differ:
 * a comment has both a comment author and the author of the thing commented on,
 * a push has neither. Keeping the grammar as data means the row renders one way
 * and every event describes itself.
 */

export type Slot =
	| "repositories"
	| "branches"
	| "labels"
	| "actor"
	| "subjectAuthor"
	| "commentFilter";

export type SentencePart = { text: string } | { slot: Slot };

export const GITHUB_SENTENCES: Record<GithubTriggerEvent, SentencePart[]> = {
	draft_opened: [
		{ text: "Draft opened in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	"pull_request.opened": [
		{ text: "PR opened in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	"pull_request.pushed": [
		{ text: "PR pushed in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	"pull_request.merged": [
		{ text: "PR merged in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	comment_added: [
		{ slot: "commentFilter" },
		{ text: "by" },
		{ slot: "actor" },
		{ text: "on a PR by" },
		{ slot: "subjectAuthor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	issue_comment: [
		{ slot: "commentFilter" },
		{ text: "by" },
		{ slot: "actor" },
		{ text: "on an issue by" },
		{ slot: "subjectAuthor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	push_to_branch: [
		{ text: "Push to" },
		{ slot: "branches" },
		{ text: "in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	label_change: [
		{ text: "Label" },
		{ slot: "labels" },
		{ text: "changed in" },
		{ slot: "repositories" },
		{ text: "by" },
		{ slot: "actor" },
	],
	checks_completed: [{ text: "Checks completed in" }, { slot: "repositories" }],
	pr_review_comment: [
		{ slot: "commentFilter" },
		{ text: "in a review by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"pr_review_submitted.approved": [
		{ text: "PR approved by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"pr_review_submitted.changes_requested": [
		{ text: "Changes requested by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"pr_review_submitted.commented": [
		{ text: "Review commented by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"pr_review_submitted.any": [
		{ text: "Any review submitted by" },
		{ slot: "actor" },
		{ text: "in" },
		{ slot: "repositories" },
	],
	"review_thread.resolved": [
		{ text: "Review thread resolved in" },
		{ slot: "repositories" },
	],
	"review_thread.unresolved": [
		{ text: "Review thread unresolved in" },
		{ slot: "repositories" },
	],
	"review_thread.any": [
		{ text: "Any review thread event in" },
		{ slot: "repositories" },
	],
	"workflow_run.success": [
		{ text: "Workflow succeeded in" },
		{ slot: "repositories" },
	],
	"workflow_run.failure": [
		{ text: "Workflow failed in" },
		{ slot: "repositories" },
	],
	"workflow_run.cancelled": [
		{ text: "Workflow cancelled in" },
		{ slot: "repositories" },
	],
	"workflow_run.any": [
		{ text: "Any workflow conclusion in" },
		{ slot: "repositories" },
	],
};

/**
 * The Add Trigger subtree, grouped the way the events actually divide. Leaves
 * create a config directly, so the menu renderer never needs to know what a
 * GitHub event is.
 */
export const GITHUB_MENU: TriggerMenuEntry<GithubConfig>[] = [
	leaf("Draft opened", "draft_opened"),
	{
		label: "Pull request…",
		children: [
			leaf("Opened", "pull_request.opened"),
			leaf("Pushed", "pull_request.pushed"),
			leaf("Merged", "pull_request.merged"),
		],
	},
	leaf("Comment added", "comment_added"),
	leaf("New push to branch", "push_to_branch"),
	leaf("Label change", "label_change"),
	leaf("Checks completed", "checks_completed"),
	leaf("Issue comment", "issue_comment"),
	leaf("PR review comment", "pr_review_comment"),
	{
		label: "PR review submitted…",
		children: [
			leaf("Approved", "pr_review_submitted.approved"),
			leaf("Changes requested", "pr_review_submitted.changes_requested"),
			leaf("Commented", "pr_review_submitted.commented"),
			leaf("Any review", "pr_review_submitted.any"),
		],
	},
	{
		label: "Review thread…",
		children: [
			leaf("Resolved", "review_thread.resolved"),
			leaf("Unresolved", "review_thread.unresolved"),
			leaf("Any thread event", "review_thread.any"),
		],
	},
	{
		label: "Workflow run completed…",
		children: [
			leaf("Success", "workflow_run.success"),
			leaf("Failure", "workflow_run.failure"),
			leaf("Cancelled", "workflow_run.cancelled"),
			leaf("Any conclusion", "workflow_run.any"),
		],
	},
];

function leaf(label: string, event: GithubTriggerEvent) {
	return { label, create: () => createGithubConfig(event) };
}

/** Events whose sentence carries a second person and a body filter. */
const COMMENT_EVENTS = new Set<GithubTriggerEvent>([
	"comment_added",
	"issue_comment",
]);

/**
 * A new trigger of this event: the repository still to be chosen, every
 * optional filter wide open.
 */
export function createGithubConfig(event: GithubTriggerEvent) {
	const base = {
		kind: "github" as const,
		// An empty list matches nothing, which is the safety property for
		// repositories: an unfinished trigger must not fire on every repo, and
		// the form refuses to save until one is chosen.
		repositories: { mode: "list" as const, ids: [] as string[] },
		// Branches and labels are optional narrowings, so they start at "any" —
		// shown or not. An empty list here would render as "Any branch" while
		// matching nothing, and nothing validates them, so the trigger would
		// look complete and never fire.
		branches: { mode: "any" as const },
		labels: { mode: "any" as const },
		actor: { mode: "any" as const },
		includeForks: false as const,
	};

	// Branching rather than spreading conditionally: the config is a union, and
	// an optional field does not narrow it to the comment member.
	if (COMMENT_EVENTS.has(event)) {
		return {
			...base,
			event: event as "comment_added" | "issue_comment",
			subjectAuthor: { mode: "any" as const },
			commentFilter: null,
		};
	}
	return {
		...base,
		event: event as Exclude<
			GithubTriggerEvent,
			"comment_added" | "issue_comment"
		>,
	};
}
