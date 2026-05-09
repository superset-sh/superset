import { describe, expect, test } from "bun:test";
import type { GraphQLPullRequestNode } from "../github-query/types";
import { selectPullRequestMatches } from "./select-pr-match";

const ORG = "octocat";
const REPO = "hello";

function makeNode(
	overrides: Partial<GraphQLPullRequestNode> = {},
): GraphQLPullRequestNode {
	return {
		number: 1,
		title: "PR",
		url: "https://github.com/octocat/hello/pull/1",
		state: "OPEN",
		isDraft: false,
		headRefName: "feature-x",
		headRefOid: "abc",
		baseRefName: "main",
		isCrossRepository: false,
		headRepositoryOwner: { login: ORG },
		headRepository: { name: REPO },
		reviewDecision: null,
		updatedAt: "2026-05-08T00:00:00Z",
		statusCheckRollup: null,
		...overrides,
	};
}

function key(branch: string): string {
	return `${ORG}/${REPO}#${branch}`;
}

describe("selectPullRequestMatches", () => {
	test("matches a same-repo feature PR to its workspace", () => {
		const nodes = [makeNode({ number: 1, headRefName: "feature-x" })];
		const result = selectPullRequestMatches({
			nodes,
			wantedKeys: new Set([key("feature-x")]),
			defaultBranch: "main",
		});
		expect(result.get(key("feature-x"))?.number).toBe(1);
	});

	test("skips a merged PR whose head is the project default branch (issue #4260)", () => {
		// Someone created a PR head=main, base=feature-x and merged it. The
		// naive head-key match would attach this MERGED PR to the local main
		// workspace and surface "main has a merged PR" in the sidebar.
		const nodes = [
			makeNode({
				number: 99,
				headRefName: "main",
				baseRefName: "feature-x",
				state: "MERGED",
			}),
		];
		const result = selectPullRequestMatches({
			nodes,
			wantedKeys: new Set([key("main")]),
			defaultBranch: "main",
		});
		expect(result.has(key("main"))).toBe(false);
	});

	test("does not skip when default branch is unknown", () => {
		const nodes = [
			makeNode({ number: 7, headRefName: "main", baseRefName: "feature-x" }),
		];
		const result = selectPullRequestMatches({
			nodes,
			wantedKeys: new Set([key("main")]),
			defaultBranch: null,
		});
		expect(result.get(key("main"))?.number).toBe(7);
	});

	test("picks the latest-updated PR per upstream key", () => {
		const nodes = [
			makeNode({
				number: 1,
				headRefName: "feature-x",
				updatedAt: "2026-05-01T00:00:00Z",
			}),
			makeNode({
				number: 2,
				headRefName: "feature-x",
				updatedAt: "2026-05-08T00:00:00Z",
			}),
		];
		const result = selectPullRequestMatches({
			nodes,
			wantedKeys: new Set([key("feature-x")]),
			defaultBranch: "main",
		});
		expect(result.get(key("feature-x"))?.number).toBe(2);
	});

	test("ignores PRs with no head repository (deleted fork)", () => {
		const nodes = [
			makeNode({
				number: 5,
				headRefName: "feature-x",
				headRepositoryOwner: null,
				headRepository: null,
			}),
		];
		const result = selectPullRequestMatches({
			nodes,
			wantedKeys: new Set([key("feature-x")]),
			defaultBranch: "main",
		});
		expect(result.size).toBe(0);
	});

	test("matches case-insensitively on owner/repo, case-sensitively on branch", () => {
		const nodes = [
			makeNode({
				number: 11,
				headRefName: "feature-x",
				headRepositoryOwner: { login: "OctoCat" },
				headRepository: { name: "Hello" },
			}),
		];
		const result = selectPullRequestMatches({
			nodes,
			wantedKeys: new Set(["octocat/hello#feature-x"]),
			defaultBranch: "main",
		});
		expect(result.get("octocat/hello#feature-x")?.number).toBe(11);
	});
});
