import { describe, expect, it } from "bun:test";
import type { TriggerScope } from "../automation-triggers";
import {
	type GithubMatchableEvent,
	githubEventNames,
	githubTriggerMatches,
} from "./github";

const names = (
	eventType: string,
	overrides: Partial<Parameters<typeof githubEventNames>[0]> = {},
) =>
	githubEventNames({
		eventType,
		isDraft: false,
		isMerged: false,
		isPullRequestComment: false,
		reviewState: null,
		runConclusion: null,
		...overrides,
	});

describe("githubEventNames", () => {
	it("names a closed pull request merged only when it was merged", () => {
		expect(names("pull_request.closed", { isMerged: true })).toEqual([
			"pull_request.merged",
		]);
		expect(names("pull_request.closed")).toEqual([]);
	});

	it("keeps issue comments and pull request comments apart", () => {
		expect(names("issue_comment.created")).toEqual(["issue_comment"]);
		expect(
			names("issue_comment.created", { isPullRequestComment: true }),
		).toEqual(["comment_added"]);
	});

	it("counts a review comment as a pull request comment", () => {
		expect(names("pull_request_review_comment.created")).toEqual([
			"pr_review_comment",
			"comment_added",
		]);
	});

	// Being made responsible for a pull request and being asked to review one
	// are different things on GitHub, and a trigger names one or the other.
	it("keeps an assignment apart from a review request", () => {
		expect(names("pull_request.assigned")).toEqual(["pull_request.assigned"]);
		expect(names("pull_request.review_requested")).toEqual([
			"pull_request.review_requested",
		]);
	});
});

const event = (overrides: Partial<GithubMatchableEvent> = {}) =>
	({
		provider: "github",
		eventType: "pull_request.opened",
		actorId: "1234",
		actorLogin: "someone",
		body: null,
		repositoryId: "42",
		ref: null,
		actorIsExternal: null,
		labels: [],
		isFork: false,
		subjectAuthorId: null,
		subjectAuthorLogin: null,
		assigneeId: null,
		assigneeLogin: null,
		names: ["pull_request.opened"],
		...overrides,
	}) satisfies GithubMatchableEvent;

const config = (actor: TriggerScope) => ({
	event: "pull_request.opened",
	repositories: { mode: "any" } as const,
	branches: { mode: "any" } as const,
	labels: { mode: "any" } as const,
	actor,
	includeForks: false,
});

describe("githubTriggerMatches actor scope", () => {
	it("matches anyone with {mode:'any'}, even with no actor id", () => {
		expect(githubTriggerMatches(config({ mode: "any" }), event()).matches).toBe(
			true,
		);
		expect(
			githubTriggerMatches(config({ mode: "any" }), event({ actorId: null }))
				.matches,
		).toBe(true);
	});

	it("matches a listed actor id and refuses others", () => {
		expect(
			githubTriggerMatches(config({ mode: "list", ids: ["1234"] }), event())
				.matches,
		).toBe(true);
		expect(
			githubTriggerMatches(config({ mode: "list", ids: ["9999"] }), event()),
		).toEqual({ matches: false, reason: "actor" });
	});

	it("refuses a list scope when the event names no actor", () => {
		expect(
			githubTriggerMatches(
				config({ mode: "list", ids: ["1234"] }),
				event({ actorId: null }),
			),
		).toEqual({ matches: false, reason: "actor" });
	});

	it("refuses an empty list — a half-built trigger matches nothing", () => {
		expect(
			githubTriggerMatches(config({ mode: "list", ids: [] }), event()),
		).toEqual({ matches: false, reason: "actor" });
	});

	// The roster saves numeric ids, but it is empty without the members
	// permission, so the editor also takes typed logins. Both have to match.
	it("matches a listed login as well as a listed id", () => {
		expect(
			githubTriggerMatches(config({ mode: "list", ids: ["someone"] }), event())
				.matches,
		).toBe(true);
		expect(
			githubTriggerMatches(
				config({ mode: "list", ids: ["someone"] }),
				event({ actorLogin: "someone-else" }),
			),
		).toEqual({ matches: false, reason: "actor" });
	});

	it("still matches by id when the login has since changed", () => {
		expect(
			githubTriggerMatches(
				config({ mode: "list", ids: ["1234"] }),
				event({ actorLogin: "renamed" }),
			).matches,
		).toBe(true);
	});

	it("refuses a list scope when the event names neither id nor login", () => {
		expect(
			githubTriggerMatches(
				config({ mode: "list", ids: ["1234"] }),
				event({ actorId: null, actorLogin: null }),
			),
		).toEqual({ matches: false, reason: "actor" });
	});
});

/** A trigger for someone being put on a pull request. */
const assignment = (
	assignee: TriggerScope,
	actor: TriggerScope = { mode: "any" },
) => ({
	event: "pull_request.review_requested",
	repositories: { mode: "any" } as const,
	branches: { mode: "any" } as const,
	labels: { mode: "any" } as const,
	actor,
	assignee,
	includeForks: false,
});

/** A review request naming who was asked, which is not who asked. */
const requested = (overrides: Partial<GithubMatchableEvent> = {}) =>
	event({
		eventType: "pull_request.review_requested",
		names: ["pull_request.review_requested"],
		assigneeId: "77",
		assigneeLogin: "satya",
		...overrides,
	});

describe("githubTriggerMatches assignee scope", () => {
	it("matches the person put on the pull request, by id or by login", () => {
		expect(
			githubTriggerMatches(
				assignment({ mode: "list", ids: ["77"] }),
				requested(),
			).matches,
		).toBe(true);
		expect(
			githubTriggerMatches(
				assignment({ mode: "list", ids: ["satya"] }),
				requested(),
			).matches,
		).toBe(true);
	});

	// Whoever asked for the review is the actor; the two filter independently,
	// which is the whole point of a second person on the sentence.
	it("keeps the person asked apart from the person asking", () => {
		expect(
			githubTriggerMatches(
				assignment(
					{ mode: "list", ids: ["77"] },
					{ mode: "list", ids: ["1234"] },
				),
				requested(),
			).matches,
		).toBe(true);
		expect(
			githubTriggerMatches(
				assignment({ mode: "list", ids: ["1234"] }),
				requested(),
			),
		).toEqual({ matches: false, reason: "assignee" });
	});

	// GitHub sends a `requested_team` with no user when a whole team is asked.
	// "Assigned to me" must stay silent on it rather than fire for everyone.
	it("refuses a team review request, which names nobody", () => {
		expect(
			githubTriggerMatches(
				assignment({ mode: "list", ids: ["77"] }),
				requested({ assigneeId: null, assigneeLogin: null }),
			),
		).toEqual({ matches: false, reason: "assignee" });
	});

	it("watches anyone put on it with {mode:'any'}", () => {
		expect(
			githubTriggerMatches(assignment({ mode: "any" }), requested()).matches,
		).toBe(true);
	});

	// The two halves of the team rule, together, because the difference is the
	// whole design: "Anyone" means every review request here and a team one is
	// one of those; a named person cannot match a request that names no person.
	it("lets Anyone match a team request that a named person cannot", () => {
		const team = requested({ assigneeId: null, assigneeLogin: null });
		expect(
			githubTriggerMatches(assignment({ mode: "any" }), team).matches,
		).toBe(true);
		expect(
			githubTriggerMatches(assignment({ mode: "list", ids: ["77"] }), team),
		).toEqual({ matches: false, reason: "assignee" });
	});

	// "Me" is resolved to a list before it reaches a matcher, and resolves to an
	// empty one when no GitHub account is connected. Neither may match a team.
	it("stays silent on a team request for a resolved Me, connected or not", () => {
		const team = requested({ assigneeId: null, assigneeLogin: null });
		expect(
			githubTriggerMatches(assignment({ mode: "list", ids: ["77"] }), team),
		).toEqual({ matches: false, reason: "assignee" });
		expect(
			githubTriggerMatches(assignment({ mode: "list", ids: [] }), team),
		).toEqual({ matches: false, reason: "assignee" });
	});
});

describe("release events", () => {
	// GitHub sends five actions on the release webhook and the product offers
	// all five, so each qualified wire type has to arrive as its own trigger
	// name rather than collapsing into one "a release happened".
	it.each([
		"release.published",
		"release.created",
		"release.edited",
		"release.unpublished",
		"release.deleted",
	])("%s maps to itself", (eventType) => {
		expect(names(eventType)).toEqual([eventType as never]);
	});

	it("ignores a release action the product does not offer", () => {
		expect(names("release.prereleased")).toEqual([]);
	});

	// A release names a tag, not a branch, and carries no labels — so the
	// branch and label scopes have to pass on null/empty rather than refuse.
	it("matches a release with no ref and no labels", () => {
		expect(
			githubTriggerMatches(
				{ ...config({ mode: "any" }), event: "release.published" },
				event({
					eventType: "release.published",
					names: ["release.published"],
					ref: null,
					labels: [],
				}),
			),
		).toEqual({ matches: true });
	});

	it("does not fire a trigger that names a different release action", () => {
		expect(
			githubTriggerMatches(
				{ ...config({ mode: "any" }), event: "release.deleted" },
				event({
					eventType: "release.published",
					names: ["release.published"],
				}),
			).matches,
		).toBe(false);
	});
});
