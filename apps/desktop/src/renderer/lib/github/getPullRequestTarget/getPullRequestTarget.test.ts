import { describe, expect, it } from "bun:test";
import { getPullRequestTarget } from "./getPullRequestTarget";

const projects = [
	{ projectKey: "other", repoOwner: "other", repoName: "repo" },
	{ projectKey: "matching", repoOwner: "superset-sh", repoName: "superset" },
];
const ref = { repoFullName: "superset-sh/superset", number: 42 };

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
		).toEqual({ ref, projectId: "matching" });
	});

	it("matches the project case-insensitively and keeps the URL's spelling", () => {
		expect(
			getPullRequestTarget(
				"https://github.com/SUPERSET-SH/Superset/pull/42",
				projects,
			),
		).toEqual({
			ref: { repoFullName: "SUPERSET-SH/Superset", number: 42 },
			projectId: "matching",
		});
	});

	it.each([
		"about:blank",
		"https://github.com/superset-sh/superset/issues/42",
		"https://github.com/superset-sh/superset/pulls",
		"https://github.com/superset-sh/superset/pull/new",
		"https://github.com/superset-sh/superset/pull/42oops",
		"https://github.com.evil.com/superset-sh/superset/pull/42",
		"https://example.com/superset-sh/superset/pull/42",
	])("is not a pull request: %s", (url) => {
		expect(getPullRequestTarget(url, projects)).toBeNull();
	});

	it("names the pull request even when no project has its repository", () => {
		expect(
			getPullRequestTarget(
				"https://github.com/untracked/repo/pull/42",
				projects,
			),
		).toEqual({
			ref: { repoFullName: "untracked/repo", number: 42 },
			projectId: null,
		});
		expect(
			getPullRequestTarget(
				"https://github.com/superset-sh/superset/pull/42",
				[],
			),
		).toEqual({ ref, projectId: null });
	});
});
