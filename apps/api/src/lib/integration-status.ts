export const INTEGRATIONS = [
	{ key: "stripe", label: "stripe", envVars: ["STRIPE_SECRET_KEY"] },
	{ key: "resend", label: "resend (email)", envVars: ["RESEND_API_KEY"] },
	{
		key: "posthog",
		label: "posthog (telemetry)",
		envVars: ["NEXT_PUBLIC_POSTHOG_KEY"],
	},
	{ key: "sentry", label: "sentry", envVars: ["NEXT_PUBLIC_SENTRY_DSN_API"] },
	{ key: "github-app", label: "github-app", envVars: ["GH_APP_ID"] },
	{ key: "github-oauth", label: "github-oauth", envVars: ["GH_CLIENT_ID"] },
	{ key: "google-oauth", label: "google-oauth", envVars: ["GOOGLE_CLIENT_ID"] },
	{ key: "linear", label: "linear", envVars: ["LINEAR_CLIENT_ID"] },
	{ key: "slack", label: "slack", envVars: ["SLACK_CLIENT_ID"] },
	{ key: "qstash", label: "qstash (jobs)", envVars: ["QSTASH_TOKEN"] },
	{
		key: "upstash-kv",
		label: "upstash-kv (rate limit)",
		envVars: ["KV_REST_API_URL", "KV_REST_API_TOKEN"],
	},
	{
		key: "blob",
		label: "vercel-blob (uploads)",
		envVars: ["BLOB_READ_WRITE_TOKEN"],
	},
	{ key: "anthropic", label: "anthropic", envVars: ["ANTHROPIC_API_KEY"] },
	{ key: "tavily", label: "tavily (search)", envVars: ["TAVILY_API_KEY"] },
] as const;

export type IntegrationKey = (typeof INTEGRATIONS)[number]["key"];
export type Integration = (typeof INTEGRATIONS)[number];
export type IntegrationStatus = "configured" | "missing";

export function getIntegrationStatuses(
	envSource: Record<string, string | undefined> = process.env,
): Record<IntegrationKey, IntegrationStatus> {
	return Object.fromEntries(
		INTEGRATIONS.map(({ key, envVars }) => [
			key,
			envVars.every((envVar) => envSource[envVar]) ? "configured" : "missing",
		]),
	) as Record<IntegrationKey, IntegrationStatus>;
}

export function getMissingIntegrations(
	envSource: Record<string, string | undefined> = process.env,
): Integration[] {
	return INTEGRATIONS.filter(({ envVars }) =>
		envVars.some((envVar) => !envSource[envVar]),
	);
}
