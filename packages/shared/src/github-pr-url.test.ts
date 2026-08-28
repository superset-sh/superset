import { describe, expect, test } from "bun:test";
import { parseGithubPullRequestUrl } from "./github-pr-url";

describe("parseGithubPullRequestUrl", () => {
	test("parses a plain PR URL", () => {
		expect(
			parseGithubPullRequestUrl(
				"https://github.com/superset-sh/superset/pull/6881",
			),
		).toEqual({ owner: "superset-sh", repo: "superset", number: 6881 });
	});

	test("tolerates a trailing slash", () => {
		expect(
			parseGithubPullRequestUrl("https://github.com/octocat/hello/pull/1/"),
		).toEqual({ owner: "octocat", repo: "hello", number: 1 });
	});

	test("tolerates a query string", () => {
		expect(
			parseGithubPullRequestUrl(
				"https://github.com/octocat/hello/pull/2?diff=split",
			),
		).toEqual({ owner: "octocat", repo: "hello", number: 2 });
	});

	test("tolerates a fragment", () => {
		expect(
			parseGithubPullRequestUrl(
				"https://github.com/octocat/hello/pull/3#issuecomment-123",
			),
		).toEqual({ owner: "octocat", repo: "hello", number: 3 });
	});

	test("tolerates PR sub-tab suffixes like /files", () => {
		expect(
			parseGithubPullRequestUrl(
				"https://github.com/octocat/hello/pull/4/files",
			),
		).toEqual({ owner: "octocat", repo: "hello", number: 4 });
	});

	test("tolerates surrounding whitespace", () => {
		expect(
			parseGithubPullRequestUrl("  https://github.com/octocat/hello/pull/5\n"),
		).toEqual({ owner: "octocat", repo: "hello", number: 5 });
	});

	test("accepts www.github.com and repo names with dots", () => {
		expect(
			parseGithubPullRequestUrl(
				"https://www.github.com/octocat/my.repo/pull/6",
			),
		).toEqual({ owner: "octocat", repo: "my.repo", number: 6 });
	});

	test("lowercases owner and repo (GitHub is case-insensitive)", () => {
		expect(
			parseGithubPullRequestUrl(
				"https://github.com/OctoCat/Hello-World/pull/7",
			),
		).toEqual({ owner: "octocat", repo: "hello-world", number: 7 });
	});

	test("rejects non-github.com hosts", () => {
		expect(
			parseGithubPullRequestUrl("https://gitlab.com/octocat/hello/pull/1"),
		).toBeNull();
		expect(
			parseGithubPullRequestUrl(
				"https://github.com.evil.io/octocat/hello/pull/1",
			),
		).toBeNull();
	});

	test("rejects non-http(s) protocols", () => {
		expect(
			parseGithubPullRequestUrl("ftp://github.com/octocat/hello/pull/1"),
		).toBeNull();
	});

	test("rejects malformed paths", () => {
		expect(
			parseGithubPullRequestUrl("https://github.com/octocat/hello"),
		).toBeNull();
		expect(
			parseGithubPullRequestUrl("https://github.com/octocat/hello/issues/1"),
		).toBeNull();
		expect(
			parseGithubPullRequestUrl("https://github.com/octocat/pull/1"),
		).toBeNull();
		expect(parseGithubPullRequestUrl("not a url")).toBeNull();
		expect(parseGithubPullRequestUrl("")).toBeNull();
	});

	test("rejects a non-numeric or out-of-range PR number", () => {
		expect(
			parseGithubPullRequestUrl("https://github.com/octocat/hello/pull/abc"),
		).toBeNull();
		expect(
			parseGithubPullRequestUrl("https://github.com/octocat/hello/pull/1x"),
		).toBeNull();
		expect(
			parseGithubPullRequestUrl(
				"https://github.com/octocat/hello/pull/99999999999999",
			),
		).toBeNull();
	});
});
