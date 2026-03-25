import { describe, expect, test } from "bun:test";
import {
	mergePullRequestComments,
	parseConversationCommentsResponse,
	parsePaginatedApiArray,
	parseReviewThreadCommentsResponse,
} from "./comments";
import { resolveRemoteBranchNameForGitHubStatus } from "./github";
import {
	branchMatchesPR,
	getPRHeadBranchCandidates,
	prMatchesLocalBranch,
} from "./pr-resolution";
import {
	getPullRequestRepoArgs,
	shouldRefreshCachedRepoContext,
} from "./repo-context";

describe("branchMatchesPR", () => {
	test("matches same-repo branch exactly", () => {
		expect(branchMatchesPR("feature/my-thing", "feature/my-thing")).toBe(true);
	});

	test("matches fork PR with owner prefix", () => {
		expect(
			branchMatchesPR("forkowner/feature/my-thing", "feature/my-thing"),
		).toBe(true);
	});

	test("rejects different branch name", () => {
		expect(branchMatchesPR("feature/new-thing", "feature/old-thing")).toBe(
			false,
		);
	});

	test("rejects stale tracking ref mismatch", () => {
		expect(branchMatchesPR("kitenite/fix-bug", "someone-else/old-pr")).toBe(
			false,
		);
	});

	test("rejects partial suffix match that is not a path segment", () => {
		expect(branchMatchesPR("my-thing", "thing")).toBe(false);
	});
});

describe("getPullRequestRepoArgs", () => {
	test("returns upstream repo args for forks", () => {
		expect(
			getPullRequestRepoArgs({
				isFork: true,
				upstreamUrl: "git@github.com:superset-sh/superset.git",
			}),
		).toEqual(["--repo", "superset-sh/superset"]);
	});

	test("returns no repo args for non-forks", () => {
		expect(
			getPullRequestRepoArgs({
				isFork: false,
				upstreamUrl: "https://github.com/superset-sh/superset",
			}),
		).toEqual([]);
	});

	test("returns no repo args for malformed upstream urls", () => {
		expect(
			getPullRequestRepoArgs({
				isFork: true,
				upstreamUrl: "not-a-github-url",
			}),
		).toEqual([]);
	});
});

describe("shouldRefreshCachedRepoContext", () => {
	test("returns false when no cached repo context exists", () => {
		expect(
			shouldRefreshCachedRepoContext({
				originUrl: "https://github.com/superset-sh/superset",
				cachedRepoContext: null,
			}),
		).toBe(false);
	});

	test("returns false when the cached repo still matches origin", () => {
		expect(
			shouldRefreshCachedRepoContext({
				originUrl: "https://github.com/superset-sh/superset",
				cachedRepoContext: {
					repoUrl: "https://github.com/superset-sh/superset",
					upstreamUrl: "https://github.com/superset-sh/superset",
					isFork: false,
				},
			}),
		).toBe(false);
	});

	test("returns false when origin is missing", () => {
		expect(
			shouldRefreshCachedRepoContext({
				originUrl: null,
				cachedRepoContext: {
					repoUrl: "https://github.com/superset-sh/superset",
					upstreamUrl: "https://github.com/superset-sh/superset",
					isFork: false,
				},
			}),
		).toBe(false);
	});

	test("treats SSH and HTTPS forms of the same repo as equal", () => {
		expect(
			shouldRefreshCachedRepoContext({
				originUrl: "git@github.com:Superset-Sh/superset.git",
				cachedRepoContext: {
					repoUrl: "https://github.com/superset-sh/superset",
					upstreamUrl: "https://github.com/superset-sh/superset",
					isFork: false,
				},
			}),
		).toBe(false);
	});

	test("returns true when origin no longer matches the cached repo", () => {
		expect(
			shouldRefreshCachedRepoContext({
				originUrl: "https://github.com/Kitenite/superset",
				cachedRepoContext: {
					repoUrl: "https://github.com/superset-sh/superset",
					upstreamUrl: "https://github.com/superset-sh/superset",
					isFork: false,
				},
			}),
		).toBe(true);
	});
});

describe("parseReviewThreadCommentsResponse", () => {
	test("normalizes inline review-thread comments with file metadata", () => {
		expect(
			parseReviewThreadCommentsResponse([
				{
					isResolved: false,
					comments: {
						nodes: [
							{
								databaseId: 42,
								author: {
									login: "octocat",
									avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
								},
								body: "Please rename this helper.",
								createdAt: "2026-03-21T04:19:41Z",
								url: "https://github.com/superset-sh/superset/pull/2681#discussion_r42",
								path: "apps/desktop/src/file.ts",
								line: 19,
							},
						],
						pageInfo: {
							hasNextPage: false,
							endCursor: null,
						},
					},
				},
			]),
		).toEqual([
			{
				id: "review-42",
				authorLogin: "octocat",
				avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
				body: "Please rename this helper.",
				createdAt: new Date("2026-03-21T04:19:41Z").getTime(),
				url: "https://github.com/superset-sh/superset/pull/2681#discussion_r42",
				kind: "review",
				path: "apps/desktop/src/file.ts",
				line: 19,
				isResolved: false,
			},
		]);
	});

	test("marks all comments in resolved threads as resolved", () => {
		expect(
			parseReviewThreadCommentsResponse([
				{
					isResolved: true,
					comments: {
						nodes: [
							{
								databaseId: 42,
								author: {
									login: "octocat",
								},
								body: "Please rename this helper.",
								createdAt: "2026-03-21T04:19:41Z",
								url: "https://github.com/superset-sh/superset/pull/2681#discussion_r42",
								path: "apps/desktop/src/file.ts",
								line: 19,
							},
						],
						pageInfo: {
							hasNextPage: false,
							endCursor: null,
						},
					},
				},
			]),
		).toEqual([
			{
				id: "review-42",
				authorLogin: "octocat",
				body: "Please rename this helper.",
				createdAt: new Date("2026-03-21T04:19:41Z").getTime(),
				url: "https://github.com/superset-sh/superset/pull/2681#discussion_r42",
				kind: "review",
				path: "apps/desktop/src/file.ts",
				line: 19,
				isResolved: true,
			},
		]);
	});

	test("falls back to the GraphQL node id when databaseId is unavailable", () => {
		expect(
			parseReviewThreadCommentsResponse([
				{
					isResolved: false,
					comments: {
						nodes: [
							{
								id: "PRRC_kwDOQGUlEs4abc",
								author: {
									login: "octocat",
								},
								body: "Please rename this helper.",
								createdAt: "2026-03-21T04:19:41Z",
								url: "https://github.com/superset-sh/superset/pull/2681#discussion_r42",
								path: "apps/desktop/src/file.ts",
								originalLine: 19,
							},
						],
						pageInfo: {
							hasNextPage: false,
							endCursor: null,
						},
					},
				},
			]),
		).toEqual([
			{
				id: "review-node-PRRC_kwDOQGUlEs4abc",
				authorLogin: "octocat",
				body: "Please rename this helper.",
				createdAt: new Date("2026-03-21T04:19:41Z").getTime(),
				url: "https://github.com/superset-sh/superset/pull/2681#discussion_r42",
				kind: "review",
				path: "apps/desktop/src/file.ts",
				line: 19,
				isResolved: false,
			},
		]);
	});
});

describe("parsePaginatedApiArray", () => {
	test("flattens slurped paginated arrays", () => {
		expect(
			parsePaginatedApiArray(
				JSON.stringify([[{ id: 1 }, { id: 2 }], [{ id: 3 }]]),
			),
		).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
	});

	test("keeps single-page arrays intact", () => {
		expect(
			parsePaginatedApiArray(JSON.stringify([{ id: 1 }, { id: 2 }])),
		).toEqual([{ id: 1 }, { id: 2 }]);
	});
});

describe("parseConversationCommentsResponse", () => {
	test("normalizes top-level PR conversation comments", () => {
		expect(
			parseConversationCommentsResponse([
				{
					id: 7,
					user: {
						login: "hubot",
						avatar_url: "https://avatars.githubusercontent.com/u/2?v=4",
					},
					body: "Looks good overall.",
					created_at: "2026-03-21T04:08:13Z",
					html_url:
						"https://github.com/superset-sh/superset/pull/2681#issuecomment-7",
				},
			]),
		).toEqual([
			{
				id: "conversation-7",
				authorLogin: "hubot",
				avatarUrl: "https://avatars.githubusercontent.com/u/2?v=4",
				body: "Looks good overall.",
				createdAt: new Date("2026-03-21T04:08:13Z").getTime(),
				url: "https://github.com/superset-sh/superset/pull/2681#issuecomment-7",
				kind: "conversation",
				isResolved: false,
			},
		]);
	});
});

describe("mergePullRequestComments", () => {
	test("sorts mixed comment kinds by recency", () => {
		expect(
			mergePullRequestComments(
				[
					{
						id: "review-42",
						authorLogin: "octocat",
						body: "Inline note",
						createdAt: 200,
						kind: "review",
						isResolved: false,
					},
				],
				[
					{
						id: "conversation-7",
						authorLogin: "hubot",
						body: "Top-level note",
						createdAt: 100,
						kind: "conversation",
						isResolved: false,
					},
				],
			),
		).toEqual([
			{
				id: "review-42",
				authorLogin: "octocat",
				body: "Inline note",
				createdAt: 200,
				kind: "review",
				isResolved: false,
			},
			{
				id: "conversation-7",
				authorLogin: "hubot",
				body: "Top-level note",
				createdAt: 100,
				kind: "conversation",
				isResolved: false,
			},
		]);
	});
});

describe("getPRHeadBranchCandidates", () => {
	test("returns exact branch first", () => {
		expect(getPRHeadBranchCandidates("kitenite/feature")).toEqual([
			"kitenite/feature",
			"feature",
		]);
	});

	test("de-duplicates single-segment branches", () => {
		expect(getPRHeadBranchCandidates("main")).toEqual(["main"]);
	});
});

describe("prMatchesLocalBranch", () => {
	test("matches exact branch names", () => {
		expect(
			prMatchesLocalBranch("kitenite/feature", {
				headRefName: "kitenite/feature",
				headRepositoryOwner: { login: "Kitenite" },
			}),
		).toBe(true);
	});

	test("matches owner-prefixed local branches for fork PRs", () => {
		expect(
			prMatchesLocalBranch("forkowner/feature/my-thing", {
				headRefName: "feature/my-thing",
				headRepositoryOwner: { login: "forkowner" },
			}),
		).toBe(true);
	});

	test("rejects suffix-only matches when owner prefix does not match", () => {
		expect(
			prMatchesLocalBranch("feature/my-thing", {
				headRefName: "my-thing",
				headRepositoryOwner: { login: "someone-else" },
			}),
		).toBe(false);
	});

	test("rejects owner-prefixed matches without owner metadata", () => {
		expect(
			prMatchesLocalBranch("forkowner/feature/my-thing", {
				headRefName: "feature/my-thing",
				headRepositoryOwner: null,
			}),
		).toBe(false);
	});
});

describe("resolveRemoteBranchNameForGitHubStatus", () => {
	test("prefers the tracked upstream branch name", () => {
		expect(
			resolveRemoteBranchNameForGitHubStatus({
				localBranchName: "kitenite/feature/my-thing",
				upstreamBranchName: "feature/my-thing",
				prHeadRefName: "feature/my-thing",
			}),
		).toBe("feature/my-thing");
	});

	test("falls back to PR head branch name when no upstream is configured", () => {
		expect(
			resolveRemoteBranchNameForGitHubStatus({
				localBranchName: "kitenite/feature/my-thing",
				prHeadRefName: "feature/my-thing",
			}),
		).toBe("feature/my-thing");
	});

	test("falls back to the local branch name when no better remote branch is known", () => {
		expect(
			resolveRemoteBranchNameForGitHubStatus({
				localBranchName: "feature/my-thing",
			}),
		).toBe("feature/my-thing");
	});
});
