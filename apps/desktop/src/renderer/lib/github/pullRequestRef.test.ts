import { describe, expect, test } from "bun:test";
import { isSamePullRequest, pullRequestRefFromUrl } from "./pullRequestRef";

describe("pullRequestRefFromUrl", () => {
	test("retains a nested GitLab path, instance port, and IID", () => {
		expect(
			pullRequestRefFromUrl(
				"https://gitlab.example.com:8443/org/group/app/-/merge_requests/42/diffs",
			),
		).toEqual({
			provider: "gitlab",
			instance: "https://gitlab.example.com:8443",
			repoPath: "org/group/app",
			repoFullName: "org/group/app",
			number: 42,
		});
	});

	test("treats a legacy GitHub ref as github.com", () => {
		const legacy = { repoFullName: "org/app", number: 42 };
		const current = pullRequestRefFromUrl("https://github.com/org/app/pull/42");
		expect(current).not.toBeNull();
		if (!current) return;
		expect(isSamePullRequest(legacy, current)).toBe(true);
	});

	test("separates identical project paths and IIDs on different instances", () => {
		const first = pullRequestRefFromUrl(
			"https://gitlab-one.example.com/org/app/-/merge_requests/42",
		);
		const second = pullRequestRefFromUrl(
			"https://gitlab-two.example.com/org/app/-/merge_requests/42",
		);
		expect(first).not.toBeNull();
		expect(second).not.toBeNull();
		if (!first || !second) return;
		expect(isSamePullRequest(first, second)).toBe(false);
	});
});
