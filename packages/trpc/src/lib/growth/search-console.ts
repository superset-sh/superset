import { createSign } from "node:crypto";

import { env } from "../../env";
import { cachedGrowthMetric } from "./cache";
import { fetchWithTimeout } from "./fetch";
import { pivotWeekly, type WeeklyRow, weekStarts } from "./weeks";

// Google Search Console via a service account added as a user of the property
// (Settings → Users and permissions → the service account email, Full or
// Restricted). Search Console data lands about three days late, so every
// window ends three days ago.
const CACHE_KEY = "search-console";
const CACHE_TTL_SECONDS = 60 * 60;
const DATA_DELAY_DAYS = 3;
const TOP_ROWS = 20;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API_BASE = "https://www.googleapis.com/webmasters/v3/sites";
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ServiceAccount {
	client_email: string;
	private_key: string;
}

export interface SearchRow {
	keys: string[];
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
}

export type QueryKind = "brand" | "apache" | "nonbrand";

export interface SearchQueryRow {
	query: string;
	kind: QueryKind;
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
}

export interface SearchPageRow {
	page: string;
	clicks: number;
	impressions: number;
	ctr: number;
	position: number;
}

export interface SearchConsoleWeekly {
	weeks: string[];
	clicks: number[];
	impressions: number[];
	nonBrandClicks: number[];
}

export type SearchConsoleStats =
	| {
			available: true;
			siteUrl: string;
			range: { start: string; end: string };
			totals: {
				clicks: number;
				impressions: number;
				ctr: number;
				position: number;
			};
			byKind: Record<QueryKind, { clicks: number; impressions: number }>;
			weekly: SearchConsoleWeekly;
			topQueries: SearchQueryRow[];
			topPages: SearchPageRow[];
			fetchedAt: string;
	  }
	| { available: false; reason: string };

function base64url(input: string | Buffer): string {
	return Buffer.from(input)
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

// A signed JWT assertion for the two-legged OAuth flow service accounts use.
export function buildServiceAccountJwt(
	account: ServiceAccount,
	now = new Date(),
): string {
	const issuedAt = Math.floor(now.getTime() / 1000);
	const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
	const claims = base64url(
		JSON.stringify({
			iss: account.client_email,
			scope: SCOPE,
			aud: TOKEN_URL,
			iat: issuedAt,
			exp: issuedAt + 3600,
		}),
	);
	const signer = createSign("RSA-SHA256");
	signer.update(`${header}.${claims}`);
	const signature = base64url(signer.sign(account.private_key));
	return `${header}.${claims}.${signature}`;
}

// "superset" alone is ambiguous: Apache Superset is a far bigger search term
// than we are, so queries naming Apache are split out rather than counted as
// ours or as non-brand.
export function classifyQuery(query: string): QueryKind {
	const q = query.toLowerCase();
	if (q.includes("apache")) return "apache";
	if (q.includes("superset")) return "brand";
	return "nonbrand";
}

function isoDate(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export function dateWindow(weekCount: number, now = new Date()) {
	const end = new Date(now.getTime() - DATA_DELAY_DAYS * DAY_MS);
	const weeks = weekStarts(weekCount, end);
	return { weeks, start: weeks[0] ?? isoDate(end), end: isoDate(end) };
}

// Daily totals (complete) minus the brand and Apache clicks found in the
// daily-by-query rows, so the non-brand series never shrinks because Google
// cut the long tail off the query list.
export function groupWeekly(
	dailyTotals: SearchRow[],
	dailyByQuery: SearchRow[],
	weeks: string[],
): SearchConsoleWeekly {
	const rows: WeeklyRow[] = [];
	for (const row of dailyTotals) {
		const [date] = row.keys;
		if (!date) continue;
		const week = weekStartOf(date);
		rows.push([week, "clicks", row.clicks]);
		rows.push([week, "impressions", row.impressions]);
	}
	for (const row of dailyByQuery) {
		const [date, query] = row.keys;
		if (!date || query === undefined) continue;
		if (classifyQuery(query) !== "nonbrand") {
			rows.push([weekStartOf(date), "named", row.clicks]);
		}
	}
	const table = pivotWeekly(rows, weeks);
	const zeros = new Array<number>(weeks.length).fill(0);
	const values = (key: string) =>
		table.series.find((s) => s.key === key)?.values ?? zeros;
	const clicks = values("clicks");
	const named = values("named");
	return {
		weeks,
		clicks,
		impressions: values("impressions"),
		nonBrandClicks: clicks.map((c, i) => Math.max(0, c - (named[i] ?? 0))),
	};
}

function weekStartOf(date: string): string {
	return weekStarts(1, new Date(`${date}T00:00:00Z`))[0] ?? date;
}

async function accessToken(account: ServiceAccount): Promise<string> {
	const response = await fetchWithTimeout(TOKEN_URL, {
		method: "POST",
		headers: { "Content-Type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams({
			grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			assertion: buildServiceAccountJwt(account),
		}),
	});
	if (!response.ok) {
		throw new Error(`Google token exchange failed (${response.status})`);
	}
	const data = (await response.json()) as { access_token: string };
	return data.access_token;
}

// Google caps a page at 25,000 rows and never says whether more exist, so
// dimensioned queries page with startRow until a short page comes back.
// PAGE_LIMIT bounds the work for a property far busier than ours.
const PAGE_ROWS = 25000;
const PAGE_LIMIT = 8;

async function searchAnalyticsPage(
	token: string,
	siteUrl: string,
	body: Record<string, unknown>,
): Promise<SearchRow[]> {
	const response = await fetchWithTimeout(
		`${API_BASE}/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ type: "web", ...body }),
		},
	);
	if (!response.ok) {
		throw new Error(
			`Search Console query failed (${response.status}): ${await response.text()}`,
		);
	}
	const data = (await response.json()) as { rows?: SearchRow[] };
	return data.rows ?? [];
}

async function searchAnalytics(
	token: string,
	siteUrl: string,
	body: Record<string, unknown>,
): Promise<SearchRow[]> {
	const rows: SearchRow[] = [];
	for (let page = 0; page < PAGE_LIMIT; page += 1) {
		const batch = await searchAnalyticsPage(token, siteUrl, {
			...body,
			rowLimit: PAGE_ROWS,
			startRow: page * PAGE_ROWS,
		});
		rows.push(...batch);
		if (batch.length < PAGE_ROWS) break;
	}
	return rows;
}

function parseServiceAccount(raw: string): ServiceAccount {
	const parsed = JSON.parse(raw) as Partial<ServiceAccount>;
	if (!parsed.client_email || !parsed.private_key) {
		throw new Error("service account JSON needs client_email and private_key");
	}
	return { client_email: parsed.client_email, private_key: parsed.private_key };
}

async function fetchSearchConsoleLive(
	weekCount: number,
): Promise<SearchConsoleStats> {
	const raw = env.GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT;
	if (!raw) {
		return {
			available: false,
			reason: "GOOGLE_SEARCH_CONSOLE_SERVICE_ACCOUNT not configured",
		};
	}
	const siteUrl = env.GOOGLE_SEARCH_CONSOLE_SITE_URL;
	const account = parseServiceAccount(raw);
	const token = await accessToken(account);
	const { weeks, start, end } = dateWindow(weekCount);
	const recentStart = isoDate(new Date(Date.parse(end) - 27 * DAY_MS));

	const [dailyTotals, dailyByQuery, totals, queries, pages] = await Promise.all(
		[
			searchAnalytics(token, siteUrl, {
				startDate: start,
				endDate: end,
				dimensions: ["date"],
			}),
			searchAnalytics(token, siteUrl, {
				startDate: start,
				endDate: end,
				dimensions: ["date", "query"],
			}),
			searchAnalytics(token, siteUrl, {
				startDate: recentStart,
				endDate: end,
				dimensions: [],
			}),
			searchAnalytics(token, siteUrl, {
				startDate: recentStart,
				endDate: end,
				dimensions: ["query"],
			}),
			searchAnalytics(token, siteUrl, {
				startDate: recentStart,
				endDate: end,
				dimensions: ["page"],
			}),
		],
	);

	const byKind: Record<QueryKind, { clicks: number; impressions: number }> = {
		brand: { clicks: 0, impressions: 0 },
		apache: { clicks: 0, impressions: 0 },
		nonbrand: { clicks: 0, impressions: 0 },
	};
	const topQueries: SearchQueryRow[] = queries.map((row) => {
		const query = row.keys[0] ?? "";
		const kind = classifyQuery(query);
		if (kind !== "nonbrand") {
			byKind[kind].clicks += row.clicks;
			byKind[kind].impressions += row.impressions;
		}
		return {
			query,
			kind,
			clicks: row.clicks,
			impressions: row.impressions,
			ctr: row.ctr,
			position: row.position,
		};
	});
	const total = totals[0];
	byKind.nonbrand = {
		clicks: Math.max(
			0,
			(total?.clicks ?? 0) - byKind.brand.clicks - byKind.apache.clicks,
		),
		impressions: Math.max(
			0,
			(total?.impressions ?? 0) -
				byKind.brand.impressions -
				byKind.apache.impressions,
		),
	};

	return {
		available: true,
		siteUrl,
		range: { start: recentStart, end },
		totals: {
			clicks: total?.clicks ?? 0,
			impressions: total?.impressions ?? 0,
			ctr: total?.ctr ?? 0,
			position: total?.position ?? 0,
		},
		byKind,
		weekly: groupWeekly(dailyTotals, dailyByQuery, weeks),
		topQueries: topQueries.slice(0, TOP_ROWS),
		topPages: pages.slice(0, TOP_ROWS).map((row) => ({
			page: row.keys[0] ?? "",
			clicks: row.clicks,
			impressions: row.impressions,
			ctr: row.ctr,
			position: row.position,
		})),
		fetchedAt: new Date().toISOString(),
	};
}

export function fetchSearchConsoleStats(
	weekCount: number,
): Promise<SearchConsoleStats> {
	return cachedGrowthMetric(
		`${CACHE_KEY}:${weekCount}`,
		CACHE_TTL_SECONDS,
		() => fetchSearchConsoleLive(weekCount),
	);
}
