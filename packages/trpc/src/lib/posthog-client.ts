import { env } from "../env";

export interface InsightResults {
	name: string;
	shortId: string;
	lastRefresh: string | null;
	// PostHog is recomputing and had nothing cached to serve; the caller polls
	// until a result lands.
	pending: boolean;
	result: unknown;
}

// No app-side cache: refresh=lazy_async serves PostHog's own result cache and
// recomputes in the background past its refresh throttle (~15 min). It must
// stay async — the heavy HogQL insights take 15-20s to recompute, and
// refresh=blocking held the request open for all of it.
export async function fetchInsightResults(
	shortId: string,
): Promise<InsightResults> {
	const response = await fetch(
		`${env.POSTHOG_API_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/insights/?short_id=${shortId}&refresh=lazy_async`,
		{
			headers: {
				Authorization: `Bearer ${env.POSTHOG_API_KEY}`,
			},
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`PostHog API error: ${response.status} - ${errorText}`);
	}

	const data = (await response.json()) as {
		results?: Array<{
			name: string | null;
			short_id: string;
			last_refresh: string | null;
			query_status: { complete?: boolean; error?: boolean } | null;
			result: unknown;
		}>;
	};

	const insight = data.results?.[0];
	if (!insight) {
		throw new Error(`PostHog insight not found: ${shortId}`);
	}

	// Past cache_target_age PostHog hands back the stale result *and* a live
	// query_status for the recompute it just started, so the result being
	// present is not on its own a sign that there is nothing left to wait for.
	const recomputing = Boolean(
		insight.query_status &&
			!insight.query_status.complete &&
			!insight.query_status.error,
	);

	return {
		name: insight.name ?? "",
		shortId: insight.short_id,
		lastRefresh: insight.last_refresh,
		pending: insight.result == null || recomputing,
		result: insight.result,
	};
}
