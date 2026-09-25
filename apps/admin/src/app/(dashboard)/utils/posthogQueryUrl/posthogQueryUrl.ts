import { POSTHOG_PROJECT_URL } from "@superset/trpc/insight-registry";

// PostHog's SQL editor opens with a query from `open_query`, so a tile can
// hand off exactly the HogQL it ran for the person to change and re-run
// there. (The insights/new `#q=` node form redirects here and drops the SQL.)
export function posthogQueryUrl(query: string): string {
	return `${POSTHOG_PROJECT_URL}/sql?open_query=${encodeURIComponent(query.trim())}`;
}
