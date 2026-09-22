// GitHub star history: the shape the /starchart page and the admin dashboard
// both render. The fetcher lives in `@superset/trpc/star-history` (it needs a
// token and an HTTP client); only the types and the display formatter are here,
// so the chart components in `@superset/ui/star-chart` can share them without
// depending on the server package.

import { COMPANY } from "./constants";
import { parseGitHubRemote } from "./github-remote";

export interface StarHistoryPoint {
	/** ISO date (yyyy-mm-dd), anchored at UTC midnight. */
	date: string;
	/** Cumulative stars as of the end of this bucket. */
	stars: number;
}

export interface StarHistory {
	points: StarHistoryPoint[];
	totalStars: number;
}

/** `owner/name` for the public repo, as GitHub's REST paths want it. */
export function githubRepoSlug(): string {
	const parsed = parseGitHubRemote(COMPANY.GITHUB_URL);
	if (!parsed) {
		throw new Error("Invalid GitHub URL format");
	}
	return `${parsed.owner}/${parsed.name}`;
}

export function formatStarCount(count: number): string {
	if (count >= 1000) {
		return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}k`;
	}
	return count.toString();
}
