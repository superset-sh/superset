import type {
	DashboardSidebarWorkspaceHostType,
	DashboardSidebarWorkspaceType,
} from "../../../../../../types";

export interface WorkspaceHostTooltipInput {
	hostType: DashboardSidebarWorkspaceHostType;
	workspaceType: DashboardSidebarWorkspaceType;
	hostIsOnline: boolean | null;
	/** Owning host's display name, or null when it isn't known yet. */
	hostName: string | null;
}

export interface WorkspaceHostTooltip {
	title: string;
	description: string;
}

function getTitle(
	hostType: DashboardSidebarWorkspaceHostType,
	isMainWorkspace: boolean,
	hostIsOnline: boolean | null,
): string {
	if (isMainWorkspace) return "Main workspace";
	if (hostType === "local-device") return "Local workspace";
	if (hostType !== "remote-device") return "Cloud workspace";
	return hostIsOnline === false
		? "Remote workspace — device offline"
		: "Remote workspace";
}

/**
 * Tooltip copy for a sidebar row's host icon.
 *
 * Every remote host draws the same cloud glyph, so the icon alone cannot say
 * which machine a workspace runs on once a user pairs a second host. The
 * description names the host whenever `hostName` is known, and falls back to
 * the previous generic wording when it isn't — a cached host snapshot written
 * before names were stored has no name to show.
 */
export function getWorkspaceHostTooltip({
	hostType,
	workspaceType,
	hostIsOnline,
	hostName,
}: WorkspaceHostTooltipInput): WorkspaceHostTooltip {
	const isMainWorkspace = workspaceType === "main";
	const title = getTitle(hostType, isMainWorkspace, hostIsOnline);

	if (isMainWorkspace) {
		return {
			title,
			description: hostName
				? `Uses the repository checkout on ${hostName}`
				: "Uses the repository checkout on this host",
		};
	}

	if (hostType === "local-device") {
		return { title, description: "Running on this device" };
	}

	if (hostType !== "remote-device") {
		return { title, description: "Hosted in the cloud" };
	}

	if (hostIsOnline === false) {
		return {
			title,
			description: hostName
				? `${hostName} isn't reachable right now`
				: "The associated device isn't reachable right now",
		};
	}

	return {
		title,
		description: hostName
			? `Running on ${hostName}`
			: "Running on a paired device",
	};
}
