const ACTIVE_GITHUB_STATUS_STALE_TIME_MS = 10_000;
const ACTIVE_GITHUB_STATUS_REFETCH_INTERVAL_MS = 10_000;
const WORKSPACE_LIST_ITEM_GITHUB_STATUS_STALE_TIME_MS = 30_000;
const PASSIVE_GITHUB_STATUS_STALE_TIME_MS = 5 * 60 * 1000;
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
	isReviewTabActive?: boolean;
}

interface GitHubPRCommentsQueryPolicyOptions {
	hasWorkspaceId: boolean;
	hasActivePullRequest: boolean;
	isActive?: boolean;
	isReviewTabActive?: boolean;
}

/**
 * Centralizes GitHub query behavior so passive hover surfaces stay cheap while
 * active workspace surfaces still revalidate when they become relevant again.
 */
export function getGitHubStatusQueryPolicy(
	surface: GitHubStatusQuerySurface,
	{
		hasWorkspaceId,
		isActive = true,
		isReviewTabActive = false,
	}: GitHubStatusQueryPolicyOptions,
): GitHubQueryPolicy {
	const isEnabled = hasWorkspaceId && isActive;

	switch (surface) {
		case "changes-sidebar":
			return {
				enabled: isEnabled,
				refetchInterval:
					isEnabled && isReviewTabActive
						? ACTIVE_GITHUB_STATUS_REFETCH_INTERVAL_MS
						: false,
				refetchOnWindowFocus: isEnabled,
				staleTime: isReviewTabActive ? ACTIVE_GITHUB_STATUS_STALE_TIME_MS : 0,
			};
		case "workspace-page":
			return {
				enabled: isEnabled,
				refetchInterval: false,
				refetchOnWindowFocus: false,
				staleTime: PASSIVE_GITHUB_STATUS_STALE_TIME_MS,
			};
		case "workspace-list-item":
			return {
				enabled: isEnabled,
				refetchInterval: false,
				refetchOnWindowFocus: false,
				staleTime: WORKSPACE_LIST_ITEM_GITHUB_STATUS_STALE_TIME_MS,
			};
		case "workspace-hover-card":
		case "workspace-row":
			return {
				enabled: isEnabled,
				refetchInterval: false,
				refetchOnWindowFocus: false,
				staleTime: PASSIVE_GITHUB_STATUS_STALE_TIME_MS,
			};
	}
}

export function getGitHubPRCommentsQueryPolicy({
	hasWorkspaceId,
	hasActivePullRequest,
	isActive = true,
	isReviewTabActive = false,
}: GitHubPRCommentsQueryPolicyOptions): GitHubQueryPolicy {
	const isEnabled = hasWorkspaceId && isActive && hasActivePullRequest;

	return {
		enabled: isEnabled,
		refetchInterval:
			isEnabled && isReviewTabActive
				? GITHUB_PR_COMMENTS_REFETCH_INTERVAL_MS
				: false,
		refetchOnWindowFocus: isEnabled && isReviewTabActive,
		staleTime: GITHUB_PR_COMMENTS_STALE_TIME_MS,
	};
}
