import { describe, expect, test } from "bun:test";
import { getPullRequestUrls } from "./getPullRequestUrls";

describe("getPullRequestUrls", () => {
	test("opens active PRs once across workspaces, retaining different repositories", () => {
		const url = "https://github.com/acme/one/pull/12";
		const otherUrl = "https://github.com/acme/two/pull/12";
		expect(
			getPullRequestUrls([
				{ pullRequest: { url, state: "open" } },
				{ pullRequest: { url, state: "open" } },
				{ pullRequest: { url: otherUrl, state: "draft" } },
				{
					pullRequest: {
						url: "https://github.com/acme/one/pull/13",
						state: "queued",
					},
				},
				{
					pullRequest: {
						url: "https://github.com/acme/one/pull/14",
						state: "merged",
					},
				},
				{
					pullRequest: {
						url: "https://github.com/acme/one/pull/15",
						state: "closed",
					},
				},
				{ pullRequest: null },
			]),
		).toEqual([url, otherUrl, "https://github.com/acme/one/pull/13"]);
	});

	test("has no URLs before PR data arrives or when all links are removed", () => {
		expect(getPullRequestUrls([])).toEqual([]);
		expect(getPullRequestUrls([{ pullRequest: null }])).toEqual([]);
	});
});
