import { describe, expect, it } from "bun:test";
import { getPullRequestTarget } from "./getPullRequestTarget";

const projects = [
	{ projectKey: "other", repoOwner: "other", repoName: "repo" },
	{ projectKey: "matching", repoOwner: "superset-sh", repoName: "superset" },
];

describe("getPullRequestTarget", () => {
	it.each([
		"",
		"/",
		"/files",
		"/commits/abc",
		"/checks",
		"?x=1#discussion_r42",
	])("matches PR pages and subpages: %s", (suffix) => {
		expect(
			getPullRequestTarget(
				`https://github.com/superset-sh/superset/pull/42${suffix}`,
				projects,
			),
		).toEqual({ projectId: "matching", prNumber: "42" });
	});

	it("matches repository names case-insensitively", () => {
		expect(
			getPullRequestTarget(
				"https://www.github.com/SUPERSET-SH/Superset/pull/42",
				projects,
			),
		).toEqual({ projectId: "matching", prNumber: "42" });
	});

	it.each([
		"about:blank",
		"https://github.com/superset-sh/superset/issues/42",
		"https://github.com/superset-sh/superset/pulls",
		"https://github.com/superset-sh/superset/pull/new",
		"https://github.com/superset-sh/superset/pull/0",
		"https://github.com/superset-sh/superset/pull/42oops",
		"https://github.com/superset-sh/superset/pull/9007199254740992",
		"https://github.com.evil.com/superset-sh/superset/pull/42",
		"https://example.com/superset-sh/superset/pull/42",
		"https://github.com/untracked/repo/pull/42",
	])("does not offer an incorrect destination: %s", (url) => {
		expect(getPullRequestTarget(url, projects)).toBeNull();
	});

	it("waits for matching projects to be available", () => {
		expect(
			getPullRequestTarget(
				"https://github.com/superset-sh/superset/pull/42",
				[],
			),
		).toBeNull();
	});
});
