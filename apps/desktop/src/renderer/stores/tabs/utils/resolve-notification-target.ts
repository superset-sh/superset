import type { NotificationIds } from "shared/notification-types";
import type { Pane, Tab } from "../types";

interface TabsState {
	panes: Record<string, Pane>;
	tabs: Tab[];
}

interface ResolvedTarget extends NotificationIds {
	workspaceId: string; // Required in resolved target
}

/**
 * Resolves notification target IDs by looking up missing values from state.
 * Priority: valid paneId > sessionId > pane's tab > event tabId > tab's workspace
 */
export function resolveNotificationTarget(
	ids: NotificationIds | undefined,
	state: TabsState,
): ResolvedTarget | null {
	if (!ids) return null;

	const { paneId, sessionId, tabId, workspaceId } = ids;

	const paneIdFromSession = sessionId
		? Object.entries(state.panes).find(
				([_paneId, pane]) => pane.chat?.sessionId === sessionId,
			)?.[0]
		: undefined;
	const resolvedPaneId =
		(paneId && state.panes[paneId] ? paneId : undefined) ??
		(paneIdFromSession && state.panes[paneIdFromSession]
			? paneIdFromSession
			: undefined);
	const pane = resolvedPaneId ? state.panes[resolvedPaneId] : undefined;

	// Resolve tabId: prefer pane's tabId, fallback to event tabId
	const resolvedTabId = pane?.tabId ?? tabId;

	const tab = resolvedTabId
		? state.tabs.find((t) => t.id === resolvedTabId)
		: undefined;

	// Resolve workspaceId: prefer event, fallback to tab's workspace
	const resolvedWorkspaceId = workspaceId || tab?.workspaceId;

	if (!resolvedWorkspaceId) return null;

	return {
		paneId: resolvedPaneId,
		tabId: resolvedTabId,
		workspaceId: resolvedWorkspaceId,
	};
}
