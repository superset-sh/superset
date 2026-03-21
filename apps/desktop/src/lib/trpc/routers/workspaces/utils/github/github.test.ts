import { describe, expect, test } from "bun:test";
import {
	branchMatchesPR,
	getPullRequestRepoArgs,
	resolveRemoteBranchNameForGitHubStatus,
} from "./github";

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
