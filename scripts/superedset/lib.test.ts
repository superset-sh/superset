import { describe, expect, test } from "bun:test";
import {
	type PullRequest,
	stableDesktopReleaseTag,
	validatePullRequests,
} from "./lib";

const pullRequest = (overrides: Partial<PullRequest> = {}): PullRequest => ({
	number: 1,
	title: "Feature",
	headRefName: "feat/feature",
	headRefOid: "abc",
	createdAt: "2026-01-01T00:00:00Z",
	url: "https://example.com/1",
	commits: [{ oid: "abc" }],
	...overrides,
});

describe("validatePullRequests", () => {
	test("sorts valid one-commit PRs oldest first", () => {
		const newer = pullRequest({ number: 2, createdAt: "2026-02-01T00:00:00Z" });
		const older = pullRequest({ number: 1 });

		expect(
			validatePullRequests([newer, older]).map(({ number }) => number),
		).toEqual([1, 2]);
	});

	test("rejects a PR with multiple commits", () => {
		expect(() =>
			validatePullRequests([
				pullRequest({ commits: [{ oid: "abc" }, { oid: "def" }] }),
			]),
		).toThrow("squash it to one commit first");
	});
});

describe("stableDesktopReleaseTag", () => {
	test("accepts a stable desktop release", () => {
		expect(
			stableDesktopReleaseTag([
				{
					tag_name: "desktop-v1.35.0",
					draft: false,
					prerelease: false,
				},
			]),
		).toBe("desktop-v1.35.0");
	});

	test("rejects a prerelease", () => {
		expect(() =>
			stableDesktopReleaseTag([
				{
					tag_name: "desktop-v1.36.0-canary.1",
					draft: false,
					prerelease: true,
				},
			]),
		).toThrow("No stable desktop release found");
	});
});
