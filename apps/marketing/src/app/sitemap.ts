import { SUPPORTED_LOCALES } from "@superset/i18n";
import { COMPANY } from "@superset/shared/constants";
import type { MetadataRoute } from "next";
import { hasLocalizedContent, localeUrl } from "@/app/[lang]/metadata";
import { fetchPublicHandles } from "@/app/[lang]/utils/fetchLeaderboard";
import { getBlogPosts } from "@/lib/blog";
import { getCategoryPages } from "@/lib/category";
import { getChangelogEntries } from "@/lib/changelog";
import { getComparisonPages } from "@/lib/compare";
import { getAllLegalSlugs, getLegalPage } from "@/lib/legal";
import { themeListings } from "@/lib/marketplace";
import { getAllPeople } from "@/lib/people";
import { isMobileLaunched } from "@/lib/site-flags";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
	const baseUrl = COMPANY.MARKETING_URL;
	const isLaunched = await isMobileLaunched();

	const staticPages: MetadataRoute.Sitemap = [
		{
			url: `${baseUrl}/cloud`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		...(isLaunched
			? [
					{
						url: `${baseUrl}/mobile`,
						changeFrequency: "monthly" as const,
						priority: 0.8,
					},
				]
			: []),
		{
			url: baseUrl,
			changeFrequency: "weekly",
			priority: 1.0,
		},
		{
			url: `${baseUrl}/marketplace`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/marketplace/themes`,
			changeFrequency: "weekly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/marketplace/agents`,
			changeFrequency: "weekly",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/blog`,
			changeFrequency: "daily",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/changelog`,
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/pricing`,
			changeFrequency: "monthly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/team`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/join-us`,
			changeFrequency: "monthly",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/compare`,
			changeFrequency: "weekly",
			priority: 0.9,
		},
		{
			url: `${baseUrl}/community`,
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			url: `${baseUrl}/enterprise`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/mcp-install`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/factory-2026`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/the-production-run`,
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/leaderboard`,
			changeFrequency: "daily",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/stats`,
			changeFrequency: "daily",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/roadmap`,
			changeFrequency: "weekly",
			priority: 0.7,
		},
		{
			url: `${baseUrl}/contact`,
			changeFrequency: "monthly",
			priority: 0.6,
		},
	];

	const posts = getBlogPosts();
	const blogPages: MetadataRoute.Sitemap = posts.map((post) => ({
		url: `${baseUrl}/blog/${post.slug}`,
		lastModified: new Date(post.lastUpdated ?? post.date),
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
			lastModified: page?.lastUpdated ? new Date(page.lastUpdated) : undefined,
			changeFrequency: "yearly" as const,
			priority: 0.3,
		};
	});

	const themePages: MetadataRoute.Sitemap = themeListings.map((theme) => ({
		url: `${baseUrl}/marketplace/themes/${theme.slug}`,
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

	// Only translated content has independently indexable locale variants.
	// English-only articles remain accessible with translated navigation, but
	// their canonical URL is the bare English path.
	const expand = (entry: MetadataRoute.Sitemap[number]) => {
		const path = entry.url === baseUrl ? "/" : entry.url.slice(baseUrl.length);
		if (!hasLocalizedContent(path)) return [entry];
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
	};

	// Profiles are listed once at their canonical bare URL. Expanding each of
	// them across every locale with a full alternates map multiplies the file
	// by the square of the locale count and blew past Vercel's 19 MB ISR cap.
	const profilePages: MetadataRoute.Sitemap = (await fetchPublicHandles()).map(
		(profile) => ({
			url: `${baseUrl}/${profile.handle}`,
			lastModified: profile.lastPublishedAt ?? undefined,
			changeFrequency: "daily" as const,
			priority: 0.6,
		}),
	);

	return [...pages.flatMap(expand), ...profilePages];
}
