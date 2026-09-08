import { describe, expect, mock, test } from "bun:test";
import { COMPANY } from "@superset/shared/constants";

// Exercise the real content inventory without calling the production API.
mock.module("@/app/[lang]/utils/fetchLeaderboard", () => ({
	fetchPublicHandles: async () => [
		{ handle: "example-engineer", lastPublishedAt: new Date("2026-09-01") },
	],
}));

const { default: sitemap } = await import("./sitemap");

describe("marketing sitemap", () => {
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
});
