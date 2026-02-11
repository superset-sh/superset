import { COMPANY } from "@superset/shared/constants";
import type { MetadataRoute } from "next";
import { getBlogPosts } from "@/lib/blog";
import { getChangelogEntries } from "@/lib/changelog";
import { getComparisonPages } from "@/lib/compare";
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
			url: `${baseUrl}/team`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.8,
		},
		{
			url: `${baseUrl}/community`,
			lastModified: new Date(),
			changeFrequency: "monthly",
			priority: 0.5,
		},
		{
			url: `${baseUrl}/privacy`,
			lastModified: new Date("2025-01-15"),
			changeFrequency: "yearly",
			priority: 0.3,
		},
		{
			url: `${baseUrl}/terms`,
			lastModified: new Date("2025-01-15"),
			changeFrequency: "yearly",
			priority: 0.3,
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

	const comparisonPages: MetadataRoute.Sitemap = getComparisonPages().map(
		(page) => ({
			url: `${baseUrl}/compare/${page.slug}`,
			lastModified: new Date(page.lastUpdated || page.date),
			changeFrequency: "monthly" as const,
			priority: 0.7,
		}),
	);

	return [
		...staticPages,
		...blogPages,
		...changelogPages,
		...teamPages,
		...comparisonPages,
	];
}
