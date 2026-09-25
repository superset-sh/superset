import type { WorkspaceState } from "@superset/panes";

interface V2PaneSelection {
	activeTabId: string | null;
	activePaneIds: Record<string, string | null>;
}

const MAX_REMEMBERED_WORKSPACES = 100;
const selections = new Map<string, V2PaneSelection>();

/**
 * Remembers focus in this renderer only. Each Electron window has its own JS
 * realm, so this state cannot leak focus to another window.
 */
export function rememberV2PaneSelection<TData>(
	workspaceId: string,
	state: WorkspaceState<TData>,
): void {
	selections.delete(workspaceId);
	selections.set(workspaceId, {
		activeTabId: state.activeTabId,
		activePaneIds: Object.fromEntries(
			state.tabs.map((tab) => [tab.id, tab.activePaneId]),
		),
	});

	if (selections.size <= MAX_REMEMBERED_WORKSPACES) return;
	const oldestWorkspaceId = selections.keys().next().value;
	if (oldestWorkspaceId) selections.delete(oldestWorkspaceId);
}

/** Overlays this window's remembered focus onto a shared pane layout. */
export function applyRememberedV2PaneSelection<TData>(
	workspaceId: string,
	state: WorkspaceState<TData>,
): WorkspaceState<TData> {
	const selection = selections.get(workspaceId);
	if (!selection) return state;

	const tabs = state.tabs.map((tab) => {
		const activePaneId = selection.activePaneIds[tab.id];
		return activePaneId && tab.panes[activePaneId]
			? { ...tab, activePaneId }
			: tab;
	});
	const activeTabId = selection.activeTabId;
	return {
		...state,
		tabs,
		activeTabId:
			activeTabId && tabs.some((tab) => tab.id === activeTabId)
				? activeTabId
				: state.activeTabId,
	};
}

export function clearRememberedV2PaneSelectionsForTest(): void {
	selections.clear();
}
