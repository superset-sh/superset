import { kv } from "@vercel/kv";
import { env } from "../env";

const CACHE_TTL_SECONDS = 60 * 60; // 1 hour
const CACHE_PREFIX = `posthog:${env.NODE_ENV}:`;
const isKVConfigured = Boolean(env.KV_REST_API_URL && env.KV_REST_API_TOKEN);

// Fallback in-memory cache for local dev without KV
const memoryCache = new Map<string, { data: unknown; expiresAt: number }>();

async function getCached<T>(key: string): Promise<T | null> {
	const cacheKey = `${CACHE_PREFIX}${key}`;

	if (isKVConfigured) {
		try {
			return await kv.get<T>(cacheKey);
		} catch {
			// Fall through to memory cache on KV error
		}
	}

	// Fallback to memory cache
	const entry = memoryCache.get(cacheKey);
	if (!entry) return null;
	if (Date.now() > entry.expiresAt) {
		memoryCache.delete(cacheKey);
		return null;
	}
	return entry.data as T;
}

async function setCache<T>(key: string, data: T): Promise<void> {
	const cacheKey = `${CACHE_PREFIX}${key}`;

	if (isKVConfigured) {
		try {
			await kv.set(cacheKey, data, { ex: CACHE_TTL_SECONDS });
			return;
		} catch {
			// Fall through to memory cache on KV error
		}
	}

	// Fallback to memory cache
	memoryCache.set(cacheKey, {
		data,
		expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000,
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

export interface TrendsEventNode {
	kind: "EventsNode";
	event: string;
	math?: "dau" | "total" | "unique_session";
}

export interface TrendsQuery {
	kind: "TrendsQuery";
	series: TrendsEventNode[];
	dateRange?: {
		date_from?: string;
		date_to?: string;
	};
	breakdownFilter?: {
		breakdown: string;
		breakdown_type: "event" | "person";
	};
}

export interface HogQLQuery {
	kind: "HogQLQuery";
	query: string;
}

export interface RetentionEntity {
	id: string;
	type: "events" | "actions";
}

export interface RetentionFilter {
	period: "Hour" | "Day" | "Week" | "Month";
	totalIntervals: number;
	retentionType: "retention_first_time" | "retention_recurring";
	targetEntity: RetentionEntity;
	returningEntity: RetentionEntity;
}

export interface RetentionQuery {
	kind: "RetentionQuery";
	dateRange?: {
		date_from?: string;
		date_to?: string;
	};
	properties?: unknown[];
	retentionFilter: RetentionFilter;
	filterTestAccounts?: boolean;
}

export interface InsightVizNode {
	kind: "InsightVizNode";
	source: FunnelsQuery | RetentionQuery | TrendsQuery;
}

export type PostHogQuery = FunnelsQuery | HogQLQuery | InsightVizNode;

export interface FunnelResult {
	action_id: string;
	name: string;
	custom_name?: string;
	order: number;
	count: number;
	median_conversion_time?: number;
	average_conversion_time?: number;
}

export interface RetentionValue {
	count: number;
	label: string;
}

export interface RetentionCohort {
	date: string;
	label: string;
	values: RetentionValue[];
}

export async function executeQuery<T = unknown>(
	query: PostHogQuery,
): Promise<PostHogQueryResult<T>> {
	const cacheKey = JSON.stringify(query);
	const cached = await getCached<PostHogQueryResult<T>>(cacheKey);
	if (cached) {
		return cached;
	}

	const response = await fetch(
		`${env.POSTHOG_API_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`,
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
	await setCache(cacheKey, result);
	return result;
}

export async function executeFunnelQuery(
	series: FunnelStep[],
	dateFrom = "-7d",
): Promise<FunnelResult[]> {
	const query: InsightVizNode = {
		kind: "InsightVizNode",
		source: {
			kind: "FunnelsQuery",
			series,
			dateRange: { date_from: dateFrom },
			funnelsFilter: {
				funnelWindowInterval: 14,
				funnelWindowIntervalUnit: "day",
				funnelOrderType: "ordered",
			},
		},
	};

	const result = await executeQuery<FunnelResult[]>(query);
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

export async function executeRetentionQuery(options: {
	targetEvent: string;
	returningEvent: string;
	period?: "Hour" | "Day" | "Week" | "Month";
	totalIntervals?: number;
	dateFrom?: string;
}): Promise<RetentionCohort[]> {
	const {
		targetEvent,
		returningEvent,
		period = "Week",
		totalIntervals = 5,
		dateFrom = "-35d",
	} = options;

	const query: InsightVizNode = {
		kind: "InsightVizNode",
		source: {
			kind: "RetentionQuery",
			dateRange: { date_from: dateFrom },
			retentionFilter: {
				period,
				totalIntervals,
				retentionType: "retention_first_time",
				targetEntity: { id: targetEvent, type: "events" },
				returningEntity: { id: returningEvent, type: "events" },
			},
			filterTestAccounts: true,
		},
	};

	const result = await executeQuery<RetentionCohort[]>(query);
	return result.results;
}
