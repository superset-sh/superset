import { describe, expect, test } from "bun:test";
import {
	getGitHubRepoRef,
	getRepoNameFromPath,
	parseGitHubPrUrl,
	toCanonicalGitHubPrUrl,
} from "./github-repo";

describe("getRepoNameFromPath", () => {
	test("extracts the repo name from a posix path", () => {
		expect(getRepoNameFromPath("/Users/kietho/code/superset")).toBe("superset");
	});

	test("extracts the repo name from a windows path", () => {
		expect(getRepoNameFromPath("C:\\Users\\kietho\\code\\superset")).toBe(
			"superset",
		);
	});

	test("returns null for empty paths", () => {
		expect(getRepoNameFromPath("")).toBeNull();
	});
});

describe("getGitHubRepoRef", () => {
	test("builds a canonical repo ref from project GitHub data", () => {
		expect(
			getGitHubRepoRef({
				githubOwner: "superset-sh",
				githubRepoName: "superset",
				mainRepoPath: "/Users/kietho/code/superset",
			}),
		).toEqual({
			owner: "superset-sh",
			repoName: "superset",
			fullName: "superset-sh/superset",
			repoUrl: "https://github.com/superset-sh/superset",
		});
	});

	test("prefers the cached GitHub repo name over the local folder name", () => {
		expect(
			getGitHubRepoRef({
				githubOwner: "superset-sh",
				githubRepoName: "canonical-repo",
				mainRepoPath: "/Users/kietho/code/renamed-folder",
			}),
		).toEqual({
			owner: "superset-sh",
			repoName: "canonical-repo",
			fullName: "superset-sh/canonical-repo",
			repoUrl: "https://github.com/superset-sh/canonical-repo",
		});
	});

	test("returns null when the project is missing GitHub identity", () => {
		expect(
			getGitHubRepoRef({
				githubOwner: null,
				mainRepoPath: "/Users/kietho/code/superset",
			}),
		).toBeNull();
	});
});

describe("parseGitHubPrUrl", () => {
	test("parses canonical GitHub PR URLs", () => {
		expect(
			parseGitHubPrUrl("https://github.com/superset-sh/superset/pull/1781"),
		).toEqual({
			owner: "superset-sh",
			repo: "superset",
			number: 1781,
		});
	});

	test("parses URLs without a protocol", () => {
		expect(
			parseGitHubPrUrl("github.com/superset-sh/superset/pull/1781"),
		).toEqual({
			owner: "superset-sh",
			repo: "superset",
			number: 1781,
		});
	});

	test("rejects lookalike non-GitHub hosts", () => {
		expect(
			parseGitHubPrUrl("https://notgithub.com/superset-sh/superset/pull/1781"),
		).toBeNull();
	});

	test("rejects PR URLs with malformed numeric suffixes", () => {
		expect(
			parseGitHubPrUrl("https://github.com/superset-sh/superset/pull/1781abc"),
		).toBeNull();
	});
});

describe("toCanonicalGitHubPrUrl", () => {
	test("normalizes parsed PR data into a canonical URL", () => {
		expect(
			toCanonicalGitHubPrUrl({
				owner: "superset-sh",
				repo: "superset",
				number: 1781,
			}),
		).toBe("https://github.com/superset-sh/superset/pull/1781");
	});
});
