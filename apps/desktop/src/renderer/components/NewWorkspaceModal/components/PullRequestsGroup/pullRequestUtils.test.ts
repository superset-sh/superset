import { describe, expect, test } from "bun:test";
import {
	getRepoNameFromPath,
	parseGitHubPrUrl,
	toCanonicalGitHubPrUrl,
} from "./pullRequestUtils";

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
