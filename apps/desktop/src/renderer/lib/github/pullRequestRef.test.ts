import { describe, expect, it } from "bun:test";
import { isSamePullRequest, pullRequestRefFromUrl } from "./pullRequestRef";

describe("GitLab merge request reference", () => {
	it.each([
		"",
		"/diffs",
		"/commits",
		"?view=parallel#note_1",
	])("keeps full instance identity with subpage %s", (suffix) => {
		expect(
			pullRequestRefFromUrl(
				`https://GL.EXAMPLE:8443/team/sub/repo/-/merge_requests/7${suffix}`,
			),
		).toEqual({
			provider: "gitlab",
			host: "gl.example:8443",
			repoFullName: "team/sub/repo",
			number: 7,
		});
	});

	it("canonicalizes the HTTPS default port", () => {
		expect(
			pullRequestRefFromUrl(
				"https://gitlab.com:443/team/repo/-/merge_requests/1",
			),
		).toEqual({
			provider: "gitlab",
			host: "gitlab.com",
			repoFullName: "team/repo",
			number: 1,
		});
	});

	it.each([
		"http://gl.example/team/repo/-/merge_requests/7",
		"https://user:pass@gl.example/team/repo/-/merge_requests/7",
		"https://@gl.example/team/repo/-/merge_requests/7",
		"https://%67l.example/team/repo/-/merge_requests/7",
		"https://github.com/team/repo/-/merge_requests/7",
		"https://gl.example/team/repo/-/merge_requests/0",
		"https://gl.example/team/repo/-/merge_requests/9007199254740992",
		"https://gl.example/team/repo/-/merge_requests/7oops",
		"https://gl.example/repo/-/merge_requests/7",
		"https://gl.example/team//repo/-/merge_requests/7",
		"https://gl.example/team/../repo/-/merge_requests/7",
		"https://gl.example/team/%2e%2e/repo/-/merge_requests/7",
		"https://gl.example/team/%252e%252e/repo/-/merge_requests/7",
		"https://gl.example/team/repo%2fother/-/merge_requests/7",
		"https://gl.example/team/repo%5cother/-/merge_requests/7",
		"https://gl.example/team/repo%00/-/merge_requests/7",
		"https://gl.example/team/repo\\other/-/merge_requests/7",
		"https://gl.example/team/repo/-/merge_requests/7/../8",
		"https://gl.example/team/repo\n/-/merge_requests/7",
	])("refuses ambiguous merge request URL %s", (url) => {
		expect(pullRequestRefFromUrl(url)).toBeNull();
	});

	it("cannot establish identity for a historical unhosted GitLab reference", () => {
		const legacy = {
			repoFullName: "team/repo",
			number: 7,
			provider: "gitlab" as const,
		};
		expect(isSamePullRequest(legacy, legacy)).toBe(false);
		expect(isSamePullRequest(legacy, { ...legacy, host: "gitlab.com" })).toBe(
			false,
		);
	});

	it("separates provider, host, port, namespace casing and number", () => {
		const ref = pullRequestRefFromUrl(
			"https://gl.example/team/repo/-/merge_requests/7",
		);
		if (!ref) throw new Error("Expected fixture reference");
		expect(isSamePullRequest(ref, ref)).toBe(true);
		for (const url of [
			"https://other.example/team/repo/-/merge_requests/7",
			"https://gl.example:8443/team/repo/-/merge_requests/7",
			"https://gl.example/Team/repo/-/merge_requests/7",
			"https://gl.example/team/Repo/-/merge_requests/7",
			"https://gl.example/team/repo/-/merge_requests/8",
			"https://github.com/team/repo/pull/7",
		]) {
			const other = pullRequestRefFromUrl(url);
			if (!other) throw new Error("Expected comparison reference");
			expect(isSamePullRequest(ref, other)).toBe(false);
		}
	});

	it("preserves old GitHub reference outputs and case-insensitive equality", () => {
		expect(
			pullRequestRefFromUrl("https://github.com/Team/Repo/pull/7/files"),
		).toEqual({
			repoFullName: "Team/Repo",
			number: 7,
		});
		expect(
			isSamePullRequest(
				{ repoFullName: "Team/Repo", number: 7 },
				{ repoFullName: "team/repo", number: 7 },
			),
		).toBe(true);
	});
});
