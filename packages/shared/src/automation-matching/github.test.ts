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
