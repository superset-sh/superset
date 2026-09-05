import { env } from "../env";
import { fetchWithTimeout } from "./growth/fetch";

// Heavy weekly HogQL over 26 weeks has taken 15-20 s to recompute.
const QUERY_TIMEOUT_MS = 40_000;

// Runs an ad-hoc HogQL query through PostHog's query endpoint and returns the
// raw rows. Saved insights (posthog-client.ts) cover the canonical company
// metrics; this is for the growth tiles, whose queries live in code so they
// can be reviewed and versioned alongside the tiles that render them.
export async function runHogQL<Row extends unknown[]>(
	query: string,
): Promise<Row[]> {
	const response = await fetchWithTimeout(
		`${env.POSTHOG_API_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.POSTHOG_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
		},
		QUERY_TIMEOUT_MS,
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`PostHog query error: ${response.status} - ${errorText}`);
	}

	const data = (await response.json()) as {
		results?: unknown[][];
		error?: string | null;
	};
	if (data.error) {
		throw new Error(`PostHog query error: ${data.error}`);
	}
	return (data.results ?? []) as Row[];
}
