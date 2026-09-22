import "server-only";
import type { StarHistory } from "@superset/shared/github-stars";
import { fetchStarHistory } from "@superset/trpc/star-history";
import { env } from "@/env";

// The fetch itself is shared with the admin dashboard, which renders the same
// chart from the same daily series; this is only the marketing app's env
// boundary. Without a token GitHub's stargazers endpoint is closed even for
// public repos, and the page falls back to the live total.
export function getStarHistory(): Promise<StarHistory | null> {
	return fetchStarHistory({ token: env.GITHUB_TOKEN });
}
