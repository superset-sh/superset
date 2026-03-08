import { describe, expect, test } from "bun:test";
import { getPullRequestRepoArgs } from "./github";

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
