import { describe, expect, test } from "bun:test";
import {
	gitlabPullRequestFromUrl,
	pullRequestFromUrl,
} from "./pullRequestLinks";

describe("pullRequestFromUrl", () => {
	test("reads owner, repo and number from a pull request link", () => {
		expect(
			pullRequestFromUrl("https://github.com/superset-sh/superset/pull/7463"),
		).toEqual({ owner: "superset-sh", repo: "superset", pullNumber: 7463 });
	});

	test("keeps the pull request behind its tabs, comments and threads", () => {
		const expected = { owner: "o", repo: "r", pullNumber: 12 };
		expect(pullRequestFromUrl("https://github.com/o/r/pull/12/")).toEqual(
			expected,
		);
		expect(pullRequestFromUrl("https://github.com/o/r/pull/12/files")).toEqual(
			expected,
		);
		expect(
			pullRequestFromUrl("https://github.com/o/r/pull/12#issuecomment-9"),
		).toEqual(expected);
		expect(
			pullRequestFromUrl("https://github.com/o/r/pull/12?diff=split"),
		).toEqual(expected);
	});

	test("refuses github links that are not one pull request", () => {
		expect(pullRequestFromUrl("https://github.com/o/r/pulls")).toBe(null);
		expect(pullRequestFromUrl("https://github.com/o/r/pull")).toBe(null);
		expect(pullRequestFromUrl("https://github.com/o/r/pull/new")).toBe(null);
		expect(pullRequestFromUrl("https://github.com/o/r/pull/12a")).toBe(null);
		expect(pullRequestFromUrl("https://github.com/o/r/issues/12")).toBe(null);
		expect(pullRequestFromUrl("https://github.com/o/r")).toBe(null);
	});

	test("refuses other hosts, however similar", () => {
		expect(pullRequestFromUrl("https://gitlab.com/o/r/pull/12")).toBe(null);
		expect(
			pullRequestFromUrl("https://github.com.evil.example/o/r/pull/1"),
		).toBe(null);
		expect(pullRequestFromUrl("http://github.com/o/r/pull/12")).toBe(null);
	});

	test("refuses anything that is not a url", () => {
		expect(pullRequestFromUrl("o/r/pull/12")).toBe(null);
		expect(pullRequestFromUrl("")).toBe(null);
	});
});

const nativeUrl = "https://git.example:8443/Group/Sub/Repo/-/merge_requests/17";
test("native nested case and port survive browser suffix canonicalization", () => {
	for (const suffix of [
		"",
		"/",
		"?diff=split",
		"#note_9",
		"/?diff=split#note_9",
	]) {
		expect(gitlabPullRequestFromUrl(nativeUrl + suffix)).toEqual({
			provider: "gitlab",
			host: "git.example:8443",
			owner: "Group/Sub",
			repo: "Repo",
			pullNumber: 17,
			expectedUrl: nativeUrl,
		});
	}
});
for (const value of [
	`${nativeUrl}/diffs`,
	`${nativeUrl}//`,
	nativeUrl.replace("Group", "%2e%2e"),
	nativeUrl.replace("Sub", "%252f"),
	nativeUrl.replace("git.example", "%67it.example"),
	nativeUrl.replace("git.example", "@git.example"),
	nativeUrl.replace("17", "9007199254740993"),
	nativeUrl.replace("17", "017"),
	nativeUrl.replace("https:", "http:"),
	nativeUrl.replace("git.example:8443", "github.com"),
]) {
	test(`native ambiguous identity refuses ${value}`, () =>
		expect(gitlabPullRequestFromUrl(value)).toBeNull());
}
test("native percent encoding returns decoded identity and preserves escaped URL", () =>
	expect(
		gitlabPullRequestFromUrl(nativeUrl.replace("Group", "%47roup")),
	).toEqual({
		provider: "gitlab",
		host: "git.example:8443",
		owner: "Group/Sub",
		repo: "Repo",
		pullNumber: 17,
		expectedUrl: nativeUrl.replace("Group", "%47roup"),
	}));
