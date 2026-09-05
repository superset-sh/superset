import { cachedGrowthMetric } from "./cache";
import { fetchWithTimeout } from "./fetch";
import { LOCALE_PREFIXES } from "./site";
import {
	pivotWeekly,
	type WeeklyRow,
	type WeeklyTable,
	weekStarts,
} from "./weeks";

// The published site, not this environment's marketing URL: content velocity
// is about what is live, and dev has no marketing server to ask.
const SITEMAP_URL = "https://superset.sh/sitemap.xml";
const CACHE_KEY = "content-inventory";
const CACHE_TTL_SECONDS = 60 * 60;
const RECENT_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

// Only sections whose sitemap lastmod is the content's own date. Static pages
// report the build time, which would count every deploy as new content.
export const CONTENT_SECTIONS = ["compare", "blog", "changelog"] as const;
export type SitemapSection = (typeof CONTENT_SECTIONS)[number];

export interface SitemapEntry {
	url: string;
	lastModified: string;
}

export interface ContentSectionSummary {
	section: SitemapSection;
	pages: number;
	updatedRecently: number;
}

export interface ContentInventory {
	sections: ContentSectionSummary[];
	weekly: WeeklyTable;
	recentDays: number;
	fetchedAt: string;
}

const LOCALE_PATTERN = new RegExp(`^/(${LOCALE_PREFIXES.join("|")})(/|$)`);

export function parseSitemap(xml: string): SitemapEntry[] {
	const entries: SitemapEntry[] = [];
	const urlBlocks = xml.matchAll(/<url>([\s\S]*?)<\/url>/g);
	for (const match of urlBlocks) {
		const block = match[1] ?? "";
		const loc = /<loc>\s*([^<]+?)\s*<\/loc>/.exec(block)?.[1];
		const lastmod = /<lastmod>\s*([^<]+?)\s*<\/lastmod>/.exec(block)?.[1];
		if (loc && lastmod) entries.push({ url: loc, lastModified: lastmod });
	}
	return entries;
}

export function sectionOf(url: string): SitemapSection | null {
	const path = new URL(url).pathname;
	if (LOCALE_PATTERN.test(path)) return null;
	const segment = path.split("/")[1];
	if (!segment) return null;
	const section = CONTENT_SECTIONS.find((s) => s === segment);
	if (!section) return null;
	// The section index itself is a static page.
	return path.split("/").filter(Boolean).length >= 2 ? section : null;
}

export function summarizeContent(
	entries: SitemapEntry[],
	weekCount: number,
	now = new Date(),
): Omit<ContentInventory, "fetchedAt"> {
	const weeks = weekStarts(weekCount, now);
	const recentCutoff = now.getTime() - RECENT_DAYS * DAY_MS;
	const counts = new Map<SitemapSection, ContentSectionSummary>(
		CONTENT_SECTIONS.map((section) => [
			section,
			{ section, pages: 0, updatedRecently: 0 },
		]),
	);
	const rows: WeeklyRow[] = [];
	for (const entry of entries) {
		const section = sectionOf(entry.url);
		if (!section) continue;
		const modified = new Date(entry.lastModified);
		if (Number.isNaN(modified.getTime())) continue;
		const summary = counts.get(section);
		if (!summary) continue;
		summary.pages += 1;
		if (modified.getTime() >= recentCutoff) summary.updatedRecently += 1;
		const week = weeks.find(
			(w, i) =>
				modified >= new Date(`${w}T00:00:00Z`) &&
				(i === weeks.length - 1 ||
					modified < new Date(`${weeks[i + 1]}T00:00:00Z`)),
		);
		if (week) rows.push([week, section, 1]);
	}
	return {
		sections: [...counts.values()],
		weekly: pivotWeekly(rows, weeks, { order: CONTENT_SECTIONS }),
		recentDays: RECENT_DAYS,
	};
}

async function fetchContentInventoryLive(
	weekCount: number,
): Promise<ContentInventory> {
	const response = await fetchWithTimeout(SITEMAP_URL);
	if (!response.ok) {
		throw new Error(`sitemap fetch failed (${response.status})`);
	}
	const entries = parseSitemap(await response.text());
	return {
		...summarizeContent(entries, weekCount),
		fetchedAt: new Date().toISOString(),
	};
}

export function fetchContentInventory(
	weekCount: number,
): Promise<ContentInventory> {
	return cachedGrowthMetric(
		`${CACHE_KEY}:${weekCount}`,
		CACHE_TTL_SECONDS,
		() => fetchContentInventoryLive(weekCount),
	);
}
