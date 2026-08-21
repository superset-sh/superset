import { COMPANY } from "@superset/shared/constants";
import { getBlogPosts } from "@/lib/blog";
import { getCategoryPages } from "@/lib/category";
import { getChangelogEntries } from "@/lib/changelog";
import { getComparisonPages } from "@/lib/compare";

interface SchemaMapEntry {
	loc: string;
	schema: string;
	lastmod?: string;
}

function escapeXml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// NLWeb Schema Map: which schema.org type each page's JSON-LD carries, so
// natural-language retrieval can pull structured feeds without crawling.
export function GET() {
	const baseUrl = COMPANY.MARKETING_URL;
	const entries: SchemaMapEntry[] = [
		{ loc: `${baseUrl}/`, schema: "https://schema.org/SoftwareApplication" },
		{ loc: `${baseUrl}/pricing`, schema: "https://schema.org/Offer" },
		{ loc: `${baseUrl}/team`, schema: "https://schema.org/Organization" },
		{ loc: `${baseUrl}/blog`, schema: "https://schema.org/Blog" },
		{ loc: `${baseUrl}/compare`, schema: "https://schema.org/ItemList" },
		{ loc: `${baseUrl}/changelog`, schema: "https://schema.org/ItemList" },
		...getBlogPosts().map((post) => ({
			loc: `${baseUrl}/blog/${post.slug}`,
			schema: "https://schema.org/Article",
			lastmod: post.date,
		})),
		...getCategoryPages().map((page) => ({
			loc: `${baseUrl}${page.url}`,
			schema: "https://schema.org/Article",
			lastmod: page.lastUpdated ?? page.date,
		})),
		...getComparisonPages().map((page) => ({
			loc: `${baseUrl}/compare/${page.slug}`,
			schema: "https://schema.org/Article",
			lastmod: page.lastUpdated ?? page.date,
		})),
		...getChangelogEntries()
			.filter((entry) => !entry.draft)
			.map((entry) => ({
				loc: `${baseUrl}/changelog/${entry.slug}`,
				schema: "https://schema.org/TechArticle",
				lastmod: entry.date,
			})),
	];

	const body = [
		'<?xml version="1.0" encoding="UTF-8"?>',
		'<schemamap xmlns="http://www.nlweb.ai/schemas/schemamap/0.1">',
		...entries.flatMap((entry) => [
			"  <url>",
			`    <loc>${escapeXml(entry.loc)}</loc>`,
			`    <schema>${entry.schema}</schema>`,
			...(entry.lastmod ? [`    <lastmod>${entry.lastmod}</lastmod>`] : []),
			"  </url>",
		]),
		"</schemamap>",
		"",
	].join("\n");

	return new Response(body, {
		headers: {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600, s-maxage=3600",
		},
	});
}
