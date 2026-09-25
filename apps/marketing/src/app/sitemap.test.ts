import { describe, expect, mock, spyOn, test } from "bun:test";
import { COMPANY } from "@superset/shared/constants";
import * as blog from "@/lib/blog";
import * as compare from "@/lib/compare";

// Exercise the real content inventory without calling the production API.
mock.module("@/app/[lang]/utils/fetchLeaderboard", () => ({
	fetchParticipant: async () => null,
	fetchPublicHandles: async () => [
		{ handle: "example-engineer", lastPublishedAt: new Date("2026-09-01") },
		{ handle: "undated-engineer", lastPublishedAt: null },
	],
}));

let isMobileLaunched = false;
mock.module("@/lib/site-flags", () => ({
	isMobileLaunched: async () => isMobileLaunched,
}));

const { default: sitemap } = await import("./sitemap");

describe("marketing sitemap", () => {
	test("uses recorded modification dates and omits unknown dates", async () => {
		const entries = await sitemap();
		const entryFor = (path: string) =>
			entries.find((entry) => entry.url === `${COMPANY.MARKETING_URL}${path}`);

		expect(entryFor("/pricing")).toBeDefined();
		expect(entryFor("/pricing")?.lastModified).toBeUndefined();
		expect(entryFor("/fr/pricing")?.lastModified).toBeUndefined();
		expect(entryFor("/undated-engineer")).toBeDefined();
		expect(entryFor("/undated-engineer")?.lastModified).toBeUndefined();
		expect(entryFor("/example-engineer")?.lastModified).toEqual(
			new Date("2026-09-01"),
		);
	});

	test("prefers article update dates and falls back to publication dates", async () => {
		const article = {
			slug: "updated-article",
			url: "/blog/updated-article",
			title: "Updated article",
			description: "An article with a recorded update",
			content: "Article body",
			date: "2025-01-01",
			lastUpdated: "2025-02-01",
		};
		const post: blog.BlogPost = {
			...article,
			category: "Engineering",
			author: { id: "author", name: "Author", role: "Engineer", content: "" },
		};
		const blogSpy = spyOn(blog, "getBlogPosts").mockReturnValue([
			post,
			{ ...post, slug: "original-article", lastUpdated: undefined },
		]);
		const compareSpy = spyOn(compare, "getComparisonPages").mockReturnValue([
			{ ...article, type: "tutorial", competitors: [], keywords: [] },
			{
				...article,
				slug: "original-comparison",
				lastUpdated: undefined,
				type: "tutorial",
				competitors: [],
				keywords: [],
			},
		]);
		try {
			const dates = new Map(
				(await sitemap()).map((entry) => [entry.url, entry.lastModified]),
			);
			for (const path of [
				"/blog/updated-article",
				"/compare/updated-article",
			]) {
				expect(dates.get(`${COMPANY.MARKETING_URL}${path}`)).toEqual(
					new Date("2025-02-01"),
				);
			}
			for (const path of [
				"/blog/original-article",
				"/compare/original-comparison",
			]) {
				expect(dates.get(`${COMPANY.MARKETING_URL}${path}`)).toEqual(
					new Date("2025-01-01"),
				);
			}
		} finally {
			blogSpy.mockRestore();
			compareSpy.mockRestore();
		}
	});

	test("lists canonical articles and profiles once and omits nonexistent discovery variants", async () => {
		const entries = await sitemap();
		const urls = entries.map((entry) => entry.url);

		expect(urls.some((url) => url.endsWith("/llms.txt"))).toBe(false);
		expect(
			urls.filter((url) => url.includes("/compare/superset-vs-warp")),
		).toEqual([`${COMPANY.MARKETING_URL}/compare/superset-vs-warp`]);
		expect(urls.filter((url) => url.endsWith("/example-engineer"))).toEqual([
			`${COMPANY.MARKETING_URL}/example-engineer`,
		]);
		expect(urls).toContain(`${COMPANY.MARKETING_URL}/fr`);
		expect(urls).toContain(`${COMPANY.MARKETING_URL}/fr/pricing`);
		expect(new Set(urls).size).toBe(urls.length);
	});

	test("lists /mobile only once the launch flag is on", async () => {
		const mobileUrl = `${COMPANY.MARKETING_URL}/mobile`;

		isMobileLaunched = false;
		const before = (await sitemap()).map((entry) => entry.url);
		expect(before).not.toContain(mobileUrl);

		isMobileLaunched = true;
		const after = (await sitemap()).map((entry) => entry.url);
		expect(after).toContain(mobileUrl);
		expect(after).toContain(`${COMPANY.MARKETING_URL}/fr/mobile`);
	});
});
