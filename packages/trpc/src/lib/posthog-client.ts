import { env } from "../env";

const POSTHOG_API_BASE = "https://us.posthog.com";
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | null {
	const entry = cache.get(key);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return null;
	}
	return entry.data as T;
}

function setCache<T>(key: string, data: T): void {
	cache.set(key, {
		data,
		expiresAt: Date.now() + CACHE_TTL_MS,
	});
}

export interface PostHogQueryResult<T = unknown> {
	results: T;
	columns?: string[];
	types?: string[];
}

export interface FunnelStep {
	kind: "EventsNode";
	event: string;
	name?: string;
}

export interface FunnelsQuery {
	kind: "FunnelsQuery";
	series: FunnelStep[];
	dateRange?: {
		date_from?: string;
		date_to?: string;
	};
	funnelsFilter?: {
		funnelWindowInterval?: number;
		funnelWindowIntervalUnit?: "day" | "hour" | "minute" | "week" | "month";
		funnelOrderType?: "ordered" | "unordered" | "strict";
	};
}

export interface HogQLQuery {
	kind: "HogQLQuery";
	query: string;
}

export type PostHogQuery = FunnelsQuery | HogQLQuery;

export interface FunnelResult {
	action_id: string;
	name: string;
	custom_name?: string;
	order: number;
	count: number;
	median_conversion_time?: number;
	average_conversion_time?: number;
}

export async function executeQuery<T = unknown>(
	query: PostHogQuery,
): Promise<PostHogQueryResult<T>> {
	const cacheKey = JSON.stringify(query);
	const cached = getCached<PostHogQueryResult<T>>(cacheKey);
	if (cached) {
		return cached;
	}

	const response = await fetch(
		`${POSTHOG_API_BASE}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`,
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${env.POSTHOG_API_KEY}`,
			},
			body: JSON.stringify({ query }),
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`PostHog API error: ${response.status} - ${errorText}`);
	}

	const result = (await response.json()) as PostHogQueryResult<T>;
	setCache(cacheKey, result);
	return result;
}

export async function executeFunnelQuery(
	series: FunnelStep[],
	dateFrom = "-7d",
): Promise<FunnelResult[][]> {
	const query: FunnelsQuery = {
		kind: "FunnelsQuery",
		series,
		dateRange: { date_from: dateFrom },
		funnelsFilter: {
			funnelWindowInterval: 14,
			funnelWindowIntervalUnit: "day",
			funnelOrderType: "ordered",
		},
	};

	const result = await executeQuery<FunnelResult[][]>(query);
	return result.results;
}

export async function executeHogQLQuery<T = unknown[][]>(
	sqlQuery: string,
): Promise<{ results: T; columns: string[] }> {
	const query: HogQLQuery = {
		kind: "HogQLQuery",
		query: sqlQuery,
	};

	const result = await executeQuery<T>(query);
	return {
		results: result.results,
		columns: result.columns ?? [],
	};
}
