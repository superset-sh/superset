interface TabsStateLike {
	tabs: Array<{ id: string; workspaceId: string }>;
	panes: Record<
		string,
		{
			id: string;
			tabId: string;
			type: string;
			cwd?: string | null;
			initialCwd?: string | null;
		}
	>;
}

export interface V1TerminalPane {
	paneId: string;
	v1WorkspaceId: string;
	cwd: string | null;
}

// v1 wrote one shared tabs record before multi-window, one per window after.
export function collectV1TerminalPanes(data: {
	tabsState: TabsStateLike;
	tabsStateByWindow?: Record<string, TabsStateLike>;
}): V1TerminalPane[] {
	const byPaneId = new Map<string, V1TerminalPane>();
	for (const tabsState of [
		data.tabsState,
		...Object.values(data.tabsStateByWindow ?? {}),
	]) {
		const workspaceIdByTabId = new Map(
			tabsState.tabs.map((tab) => [tab.id, tab.workspaceId]),
		);
		for (const pane of Object.values(tabsState.panes)) {
			if (pane.type !== "terminal") continue;
			const v1WorkspaceId = workspaceIdByTabId.get(pane.tabId);
			if (!v1WorkspaceId) continue;
			byPaneId.set(pane.id, {
				paneId: pane.id,
				v1WorkspaceId,
				cwd: pane.cwd ?? pane.initialCwd ?? null,
			});
		}
	}
	return [...byPaneId.values()];
}
