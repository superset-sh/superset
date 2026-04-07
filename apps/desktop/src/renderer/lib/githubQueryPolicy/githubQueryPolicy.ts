export const GITHUB_STATUS_STALE_TIME_MS = 10_000;
const GITHUB_STATUS_REFETCH_INTERVAL_MS = 10_000;
const GITHUB_PR_COMMENTS_STALE_TIME_MS = 30_000;
const GITHUB_PR_COMMENTS_REFETCH_INTERVAL_MS = 30_000;

export type GitHubStatusQuerySurface =
	| "changes-sidebar"
	| "workspace-page"
	| "workspace-hover-card"
	| "workspace-list-item"
	| "workspace-row";

export interface GitHubQueryPolicy {
	enabled: boolean;
	refetchInterval: number | false;
	refetchOnWindowFocus: boolean;
	staleTime: number;
}

interface GitHubStatusQueryPolicyOptions {
	hasWorkspaceId: boolean;
	isActive?: boolean;
}

interface GitHubPRCommentsQueryPolicyOptions {
	hasWorkspaceId: boolean;
	hasActivePullRequest: boolean;
	isActive?: boolean;
}

const HOVER_SURFACES: ReadonlySet<GitHubStatusQuerySurface> = new Set([
	"workspace-list-item",
	"workspace-row",
	"workspace-hover-card",
]);

/**
 * Active surfaces (changes-sidebar, workspace-page) poll every 10s.
 * Hover surfaces don't poll — callers trigger refetch on hover, debounced by staleTime.
 */
export function getGitHubStatusQueryPolicy(
	surface: GitHubStatusQuerySurface,
	{ hasWorkspaceId, isActive = true }: GitHubStatusQueryPolicyOptions,
): GitHubQueryPolicy {
	const isEnabled = hasWorkspaceId && isActive;
	const isHover = HOVER_SURFACES.has(surface);

	return {
		enabled: isEnabled,
		refetchInterval:
			isEnabled && !isHover ? GITHUB_STATUS_REFETCH_INTERVAL_MS : false,
		refetchOnWindowFocus: isEnabled && !isHover,
		staleTime: GITHUB_STATUS_STALE_TIME_MS,
	};
}

export function getGitHubPRCommentsQueryPolicy({
	hasWorkspaceId,
	hasActivePullRequest,
	isActive = true,
}: GitHubPRCommentsQueryPolicyOptions): GitHubQueryPolicy {
	const isEnabled = hasWorkspaceId && isActive && hasActivePullRequest;

	return {
		enabled: isEnabled,
		refetchInterval: isEnabled ? GITHUB_PR_COMMENTS_REFETCH_INTERVAL_MS : false,
		refetchOnWindowFocus: isEnabled,
		staleTime: GITHUB_PR_COMMENTS_STALE_TIME_MS,
	};
}
