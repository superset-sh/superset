import type { PullRequestState } from "shared/pull-request-types";

/**
 * One entry in the most-recently-used pane list, newest-first across every
 * tab, pane and workspace.
 *
 * Labels are snapshotted at focus time because the overlay renders panes from
 * workspaces that are not mounted, and those have no live store or registry to
 * resolve a title from. Names, icons and PR state are resolved live instead —
 * see useLiveEntryNames.
 */
export interface PaneMruEntry {
	workspaceId: string;
	tabId: string;
	paneId: string;
	kind: string;
	label: string;
	tabLabel: string;
	workspaceName: string;
	projectName?: string;
	projectIconUrl?: string | null;
	agentId?: string;
	/** Terminal this pane drives; agent status is published per terminal id. */
	terminalId?: string;
	pullRequestState?: PullRequestState | null;
	pullRequestNumber?: number;
	lastFocusedAt: number;
}

export type PaneMruKey = string;

/** Pane ids are unique per workspace, so identity pairs the two. */
export function entryKey(entry: {
	workspaceId: string;
	paneId: string;
}): PaneMruKey {
	return `${entry.workspaceId}:${entry.paneId}`;
}
