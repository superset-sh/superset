import { env } from "../env";

const POSTHOG_API_BASE = "https://us.posthog.com/api";

type PostHogQueryResult = {
	results: unknown[];
	columns?: string[];
	hasMore?: boolean;
};

type TrendsQuerySource = {
	kind: "TrendsQuery";
	series: Array<{
		kind: "EventsNode";
		event: string;
		math?: "total" | "dau" | "weekly_active" | "monthly_active" | "unique_session";
	}>;
	interval?: "hour" | "day" | "week" | "month";
	dateRange?: {
		date_from?: string;
		date_to?: string;
	};
	filterTestAccounts?: boolean;
};

type FunnelsQuerySource = {
	kind: "FunnelsQuery";
	series: Array<{
		kind: "EventsNode";
		event: string;
	}>;
	dateRange?: {
		date_from?: string;
		date_to?: string;
	};
	funnelsFilter?: {
		funnelWindowInterval?: number;
		funnelWindowIntervalUnit?: "day" | "week" | "month";
	};
	filterTestAccounts?: boolean;
};

type HogQLQuerySource = {
	kind: "HogQLQuery";
	query: string;
};

type InsightVizNode = {
	kind: "InsightVizNode";
	source: TrendsQuerySource | FunnelsQuerySource;
};

type DataVisualizationNode = {
	kind: "DataVisualizationNode";
	source: HogQLQuerySource;
};

export type PostHogQuery = InsightVizNode | DataVisualizationNode;

export async function queryPostHog<T = PostHogQueryResult>(
	query: PostHogQuery,
): Promise<T> {
	const response = await fetch(
		`${POSTHOG_API_BASE}/projects/${env.POSTHOG_PROJECT_ID}/query`,
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
		const error = await response.text();
		throw new Error(`PostHog API error: ${response.status} - ${error}`);
	}

	return response.json() as Promise<T>;
}

export async function getPersons(options?: {
	limit?: number;
	search?: string;
}): Promise<{
	results: Array<{
		id: string;
		distinct_ids: string[];
		properties: Record<string, unknown>;
		created_at: string;
	}>;
	next?: string;
}> {
	const params = new URLSearchParams();
	if (options?.limit) params.set("limit", String(options.limit));
	if (options?.search) params.set("search", options.search);

	const response = await fetch(
		`${POSTHOG_API_BASE}/projects/${env.POSTHOG_PROJECT_ID}/persons?${params}`,
		{
			headers: {
				Authorization: `Bearer ${env.POSTHOG_API_KEY}`,
			},
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`PostHog API error: ${response.status} - ${error}`);
	}

	return response.json() as Promise<{
		results: Array<{
			id: string;
			distinct_ids: string[];
			properties: Record<string, unknown>;
			created_at: string;
		}>;
		next?: string;
	}>;
}

export async function getPersonEvents(
	personId: string,
	options?: { limit?: number; before?: string },
): Promise<{
	results: Array<{
		id: string;
		event: string;
		timestamp: string;
		properties: Record<string, unknown>;
	}>;
	next?: string;
}> {
	const params = new URLSearchParams();
	if (options?.limit) params.set("limit", String(options.limit));
	if (options?.before) params.set("before", options.before);

	const response = await fetch(
		`${POSTHOG_API_BASE}/projects/${env.POSTHOG_PROJECT_ID}/persons/${personId}/events?${params}`,
		{
			headers: {
				Authorization: `Bearer ${env.POSTHOG_API_KEY}`,
			},
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`PostHog API error: ${response.status} - ${error}`);
	}

	return response.json() as Promise<{
		results: Array<{
			id: string;
			event: string;
			timestamp: string;
			properties: Record<string, unknown>;
		}>;
		next?: string;
	}>;
}

export async function getRecentEvents(options?: {
	limit?: number;
	event?: string;
}): Promise<{
	results: Array<{
		id: string;
		event: string;
		distinct_id: string;
		timestamp: string;
		properties: Record<string, unknown>;
		person?: {
			distinct_ids: string[];
			properties: Record<string, unknown>;
		};
	}>;
	next?: string;
}> {
	const params = new URLSearchParams();
	if (options?.limit) params.set("limit", String(options.limit));
	if (options?.event) params.set("event", options.event);

	const response = await fetch(
		`${POSTHOG_API_BASE}/projects/${env.POSTHOG_PROJECT_ID}/events?${params}`,
		{
			headers: {
				Authorization: `Bearer ${env.POSTHOG_API_KEY}`,
			},
		},
	);

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`PostHog API error: ${response.status} - ${error}`);
	}

	return response.json() as Promise<{
		results: Array<{
			id: string;
			event: string;
			distinct_id: string;
			timestamp: string;
			properties: Record<string, unknown>;
			person?: {
				distinct_ids: string[];
				properties: Record<string, unknown>;
			};
		}>;
		next?: string;
	}>;
}
