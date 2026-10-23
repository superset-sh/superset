import { describe, expect, test } from "bun:test";
import type {
	PullRequestDetailComment,
	PullRequestDetailCommit,
} from "../../../../hooks/usePullRequestDetail";
import { buildPullRequestTimeline } from "./buildPullRequestTimeline";

function comment(
	id: string,
	createdAt: string,
	overrides: Partial<PullRequestDetailComment> = {},
): PullRequestDetailComment {
	return {
		id,
		kind: "comment",
		author: { login: "maya", name: null },
		body: `Body ${id}`,
		createdAt,
		reviewState: null,
		url: null,
		...overrides,
	};
}

function commit(
	oid: string,
	login: string,
	committedDate: string,
): PullRequestDetailCommit {
	return {
		oid,
		messageHeadline: `Commit ${oid}`,
		committedDate,
		author: { login, name: null },
		url: `https://github.com/o/r/pull/1/commits/${oid}`,
	};
}

describe("the activity timeline", () => {
	test("interleaves comments, commits and the caller's entries oldest first", () => {
		const items = buildPullRequestTimeline({
			comments: [
				comment("c2", "2026-10-03T12:00:00Z"),
				comment("c1", "2026-10-03T09:00:00Z"),
			],
			commits: [commit("a1", "maya", "2026-10-03T10:00:00Z")],
			entries: [
				{
					id: "t1",
					createdAt: "2026-10-03T11:00:00Z",
					author: { login: "jonas" },
					card: null,
				},
				{ id: "t0", createdAt: null, author: null, card: null },
			],
		});
		expect(
			items.map((item) =>
				item.kind === "comment"
					? item.comment.id
					: item.kind === "commits"
						? item.commits.map((c) => c.oid).join("+")
						: item.kind === "entry"
							? item.entry.id
							: item.verdict,
			),
		).toEqual(["c1", "a1", "t1", "c2", "t0"]);
	});

	test("folds back-to-back commits by one author into a push and splits on a change of author or a comment between", () => {
		const items = buildPullRequestTimeline({
			comments: [comment("c1", "2026-10-03T10:07:00Z")],
			commits: [
				commit("a1", "maya", "2026-10-03T10:00:00Z"),
				commit("a2", "maya", "2026-10-03T10:05:00Z"),
				commit("b1", "jonas", "2026-10-03T10:06:00Z"),
				commit("a3", "maya", "2026-10-03T10:08:00Z"),
				commit("a4", "maya", "2026-10-03T10:09:00Z"),
			],
			entries: [],
		});
		expect(
			items.map((item) =>
				item.kind === "commits"
					? `${item.author?.login}:${item.commits.map((c) => c.oid).join("+")}`
					: item.kind,
			),
		).toEqual(["maya:a1+a2", "jonas:b1", "comment", "maya:a3+a4"]);
	});

	test("a review without a note is an event only when it carries a verdict", () => {
		const items = buildPullRequestTimeline({
			comments: [
				comment("approved", "2026-10-03T10:00:00Z", {
					kind: "review",
					body: "  ",
					reviewState: "approved",
					url: null,
				}),
				comment("batch", "2026-10-03T10:01:00Z", {
					kind: "review",
					body: "",
					reviewState: "COMMENTED",
					url: null,
				}),
				comment("noted", "2026-10-03T10:02:00Z", {
					kind: "review",
					body: "Looks good",
					reviewState: "APPROVED",
					url: null,
				}),
				comment("blank", "2026-10-03T10:03:00Z", { body: "" }),
			],
			commits: [],
			entries: [],
		});
		expect(
			items.map((item) =>
				item.kind === "review-event"
					? `event:${item.verdict}`
					: item.kind === "comment"
						? `comment:${item.comment.id}`
						: item.kind,
			),
		).toEqual(["event:APPROVED", "comment:noted"]);
	});
});
