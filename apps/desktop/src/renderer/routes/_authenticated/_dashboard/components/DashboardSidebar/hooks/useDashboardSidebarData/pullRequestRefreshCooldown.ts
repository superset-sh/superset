/**
 * Hover-triggered PR refreshes fire a host-service mutation per card open;
 * sweeping the pointer across rows would otherwise re-refresh the same
 * workspace many times per minute for no new data.
 */
export const PULL_REQUEST_REFRESH_COOLDOWN_MS = 45_000;

export interface PullRequestRefreshGate {
	/**
	 * True when `workspaceId` has not been refreshed within the cool-down.
	 * A `true` result records `now` as the workspace's last refresh, so
	 * concurrent callers inside the window are rejected too.
	 */
	shouldRefresh: (workspaceId: string, now: number) => boolean;
}

export function createPullRequestRefreshGate(
	cooldownMs: number = PULL_REQUEST_REFRESH_COOLDOWN_MS,
): PullRequestRefreshGate {
	const lastRefreshAtByWorkspaceId = new Map<string, number>();
	return {
		shouldRefresh(workspaceId, now) {
			const lastRefreshAt = lastRefreshAtByWorkspaceId.get(workspaceId);
			if (lastRefreshAt !== undefined && now - lastRefreshAt < cooldownMs) {
				return false;
			}
			lastRefreshAtByWorkspaceId.set(workspaceId, now);
			return true;
		},
	};
}
