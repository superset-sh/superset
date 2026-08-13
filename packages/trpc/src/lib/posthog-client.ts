import { env } from "../env";

export interface InsightResults {
	name: string;
	shortId: string;
	lastRefresh: string | null;
	result: unknown;
}

// No app-side cache: refresh=blocking serves PostHog's own result cache when
// fresh and recomputes only past its refresh throttle (~15 min).
export async function fetchInsightResults(
	shortId: string,
): Promise<InsightResults> {
	const response = await fetch(
		`${env.POSTHOG_API_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/insights/?short_id=${shortId}&refresh=blocking`,
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
			result: unknown;
		}>;
	};

	const insight = data.results?.[0];
	if (!insight) {
		throw new Error(`PostHog insight not found: ${shortId}`);
	}

	return {
		name: insight.name ?? "",
		shortId: insight.short_id,
		lastRefresh: insight.last_refresh,
		result: insight.result,
	};
}
