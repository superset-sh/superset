import type { HostNotificationWorkspaceState } from "../components/HostNotificationSubscriber";

export interface AccountSwitchGroup {
	hostUrl: string;
	workspaces: HostNotificationWorkspaceState[];
}

/**
 * Which hosts get an `AccountSwitchSubscriber`. Account events are host-wide,
 * not per workspace: a switch on the local host has to notify and refresh the
 * Usage page even when the sidebar shows no workspace on it (a filtered
 * sidebar, or a fresh install). So the local host is always subscribed, and
 * only once when it also carries visible workspaces.
 */
export function getAccountSwitchGroups({
	hostGroups,
	activeHostUrl,
}: {
	hostGroups: AccountSwitchGroup[];
	activeHostUrl: string | null;
}): AccountSwitchGroup[] {
	if (!activeHostUrl) return hostGroups;
	if (hostGroups.some((group) => group.hostUrl === activeHostUrl)) {
		return hostGroups;
	}
	return [...hostGroups, { hostUrl: activeHostUrl, workspaces: [] }];
}
