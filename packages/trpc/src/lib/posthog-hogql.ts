import { env } from "../env";

// Runs an ad-hoc HogQL query through PostHog's query endpoint and returns the
// raw rows. Saved insights (posthog-client.ts) cover the canonical company
// metrics; this is for the growth tiles, whose queries live in code so they
// can be reviewed and versioned alongside the tiles that render them.
export async function runHogQL<Row extends unknown[]>(
	query: string,
): Promise<Row[]> {
	const response = await fetch(
		`${env.POSTHOG_API_HOST}/api/projects/${env.POSTHOG_PROJECT_ID}/query/`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${env.POSTHOG_API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
		},
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
