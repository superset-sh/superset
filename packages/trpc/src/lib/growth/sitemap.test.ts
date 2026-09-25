import { describe, expect, test } from "bun:test";

import { parseSitemap, sectionOf, summarizeContent } from "./sitemap";

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>https://superset.sh/</loc><lastmod>2026-09-05T10:00:00.000Z</lastmod></url>
<url><loc>https://superset.sh/compare</loc><lastmod>2026-09-05T10:00:00.000Z</lastmod></url>
<url><loc>https://superset.sh/compare/cursor-alternative</loc><lastmod>2026-07-13T00:00:00.000Z</lastmod></url>
<url><loc>https://superset.sh/ja/compare/cursor-alternative</loc><lastmod>2026-07-13T00:00:00.000Z</lastmod></url>
<url><loc>https://superset.sh/blog/the-production-run</loc><lastmod>2026-08-27T00:00:00.000Z</lastmod></url>
<url><loc>https://superset.sh/changelog/1-26-0</loc><lastmod>2026-09-04T00:00:00.000Z</lastmod></url>
<url><loc>https://superset.sh/pricing</loc></url>
</urlset>`;

describe("parseSitemap", () => {
	test("reads loc and lastmod pairs and skips entries without lastmod", () => {
		const entries = parseSitemap(XML);
		expect(entries).toHaveLength(6);
		expect(entries[2]).toEqual({
			url: "https://superset.sh/compare/cursor-alternative",
			lastModified: "2026-07-13T00:00:00.000Z",
		});
	});
});

describe("sectionOf", () => {
	test("classifies English content pages only", () => {
		expect(sectionOf("https://superset.sh/compare/cursor-alternative")).toBe(
			"compare",
		);
		expect(sectionOf("https://superset.sh/ja/compare/cursor-alternative")).toBe(
			null,
		);
		expect(sectionOf("https://superset.sh/compare")).toBe(null);
		expect(sectionOf("https://superset.sh/pricing")).toBe(null);
	});
});

describe("summarizeContent", () => {
	test("counts pages per section and buckets updates by week", () => {
		const now = new Date("2026-09-05T12:00:00Z");
		const summary = summarizeContent(parseSitemap(XML), 3, now);
		expect(summary.sections).toEqual([
			{ section: "compare", pages: 1, updatedRecently: 0 },
			{ section: "blog", pages: 1, updatedRecently: 1 },
			{ section: "changelog", pages: 1, updatedRecently: 1 },
		]);
		expect(summary.weekly.weeks).toEqual([
			"2026-08-17",
			"2026-08-24",
			"2026-08-31",
		]);
		expect(summary.weekly.series).toEqual([
			{ key: "blog", values: [0, 1, 0] },
			{ key: "changelog", values: [0, 0, 1] },
		]);
	});
});
