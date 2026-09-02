import { SUPPORTED_LOCALES } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { MetadataRoute } from "next";
import { localeUrl } from "@/app/[lang]/metadata";
import { getBlogPosts } from "@/lib/blog";
import { getCategoryPages } from "@/lib/category";
import { getChangelogEntries } from "@/lib/changelog";
import { getComparisonPages } from "@/lib/compare";
import { getAllLegalSlugs, getLegalPage } from "@/lib/legal";
import { themeListings } from "@/lib/marketplace";
import { getAllPeople } from "@/lib/people";

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = COMPANY.MARKETING_URL;

	const staticPages: MetadataRoute.Sitemap = [
		{
			url: baseUrl,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 1.0,
		},
		{
			url: `${baseUrl}/marketplace`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/marketplace/themes`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/marketplace/agents`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/blog`,
			lastModified: new Date(),
			changeFrequency: "daily",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/changelog`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/pricing`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/team`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/join-us`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/compare`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/community`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			url: `${baseUrl}/llms.txt`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.3,
		},
		{
			url: `${baseUrl}/enterprise`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/mcp-install`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/factory-2026`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/the-production-run`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/leaderboard`,
			lastModified: new Date(),
			changeFrequency: "daily",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/stats`,
			lastModified: new Date(),
			changeFrequency: "daily",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/roadmap`,
			lastModified: new Date(),
			changeFrequency: "weekly",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/contact`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.6,
		},
	];

	const posts = getBlogPosts();
	const blogPages: MetadataRoute.Sitemap = posts.map((post) => ({
		url: `${baseUrl}/blog/${post.slug}`,
		lastModified: new Date(post.date),
		changeFrequency: "monthly" as const,
		priority: 0.8,
	}));

	const changelogEntries = getChangelogEntries();
	const changelogPages: MetadataRoute.Sitemap = changelogEntries.map(
		(entry) => ({
			url: `${baseUrl}/changelog/${entry.slug}`,
			lastModified: new Date(entry.date),
			changeFrequency: "monthly" as const,
			priority: 0.8,
		}),
	);

	const people = getAllPeople();
	const teamPages: MetadataRoute.Sitemap = people.map((person) => ({
		url: `${baseUrl}/team/${person.id}`,
		lastModified: new Date(),
		changeFrequency: "monthly" as const,
		priority: 0.7,
	}));

	const categoryPages: MetadataRoute.Sitemap = getCategoryPages().map(
		(page) => ({
			url: `${baseUrl}${page.url}`,
			lastModified: new Date(page.lastUpdated || page.date),
			changeFrequency: "weekly" as const,
			priority: 0.9,
		}),
	);

	const comparisonPages: MetadataRoute.Sitemap = getComparisonPages().map(
		(page) => ({
			url: `${baseUrl}/compare/${page.slug}`,
			lastModified: new Date(page.lastUpdated || page.date),
			changeFrequency: "weekly" as const,
			priority: 0.9,
		}),
	);

	const legalPages: MetadataRoute.Sitemap = getAllLegalSlugs().map((slug) => {
		const page = getLegalPage(slug);
		return {
			url: `${baseUrl}/${slug}`,
			lastModified: page?.lastUpdated ? new Date(page.lastUpdated) : new Date(),
			changeFrequency: "yearly" as const,
			priority: 0.3,
		};
	});

	const themePages: MetadataRoute.Sitemap = themeListings.map((theme) => ({
		url: `${baseUrl}/marketplace/themes/${theme.slug}`,
		lastModified: new Date(),
		changeFrequency: "monthly" as const,
		priority: 0.6,
	}));

	const pages = [
		...staticPages,
		...blogPages,
		...changelogPages,
		...teamPages,
		...categoryPages,
		...comparisonPages,
		...legalPages,
		...themePages,
	];

	// Every page exists once per locale (English at the bare URL, others under
	// /{locale}), and every entry names its siblings via hreflang alternates —
	// this is what makes the localized tree discoverable to search engines.
	return pages.flatMap((entry) => {
		const path = entry.url === baseUrl ? "/" : entry.url.slice(baseUrl.length);
		const languages: Record<string, string> = {
			"x-default": localeUrl("en", path),
		};
		for (const locale of SUPPORTED_LOCALES) {
			languages[locale] = localeUrl(locale, path);
		}
		return SUPPORTED_LOCALES.map((locale) => ({
			...entry,
			url: localeUrl(locale, path),
			alternates: { languages },
		}));
	});
}
