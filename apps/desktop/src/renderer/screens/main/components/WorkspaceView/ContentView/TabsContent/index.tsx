import { useParams } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTabsStore } from "renderer/stores/tabs/store";
import { resolveActiveTabIdForWorkspace } from "renderer/stores/tabs/utils";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

/**
 * Maximum number of recently-visited tabs to keep mounted in the DOM.
 * Cached tabs use `visibility: hidden` so their xterm.js instances
 * and stream subscriptions stay alive — eliminating the expensive
 * destroy/recreate cycle on tab switch.
 *
 * Kept at 3 to limit WebGL context usage (browsers cap ~8-16 contexts;
 * each terminal pane uses one, and split panes multiply the count).
 */
const MAX_CACHED_TABS = 3;

export function TabsContent() {
	const { workspaceId: activeWorkspaceId } = useParams({ strict: false });
	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const tabHistoryStacks = useTabsStore((s) => s.tabHistoryStacks);

	const activeTabId = useMemo(() => {
		if (!activeWorkspaceId) return null;

		const resolvedActiveTabId = resolveActiveTabIdForWorkspace({
			workspaceId: activeWorkspaceId,
			tabs: allTabs,
			activeTabIds,
			tabHistoryStacks,
		});
		if (!resolvedActiveTabId) return null;

		const tab = allTabs.find((t) => t.id === resolvedActiveTabId) || null;
		if (!tab || tab.workspaceId !== activeWorkspaceId) return null;
		return resolvedActiveTabId;
	}, [activeWorkspaceId, activeTabIds, allTabs, tabHistoryStacks]);

	// Build LRU list of tab IDs to keep alive in the DOM.
	// Active tab + most recently visited tabs from history stack.
	const cachedTabIds = useMemo(() => {
		if (!activeWorkspaceId || !activeTabId) return [];

		const workspaceTabIds = new Set(
			allTabs
				.filter((t) => t.workspaceId === activeWorkspaceId)
				.map((t) => t.id),
		);

		const ids: string[] = [activeTabId];

		// History stack has most recently visited tab at index 0
		const history = tabHistoryStacks[activeWorkspaceId] || [];
		for (const id of history) {
			if (ids.length >= MAX_CACHED_TABS) break;
			if (!ids.includes(id) && workspaceTabIds.has(id)) {
				ids.push(id);
			}
		}

		return ids;
	}, [activeTabId, activeWorkspaceId, tabHistoryStacks, allTabs]);

	if (cachedTabIds.length === 0) {
		return (
			<div className="flex-1 min-h-0 flex overflow-hidden">
				<EmptyTabView />
			</div>
		);
	}

	return (
		<div className="flex-1 min-h-0 flex overflow-hidden relative">
			{cachedTabIds.map((tabId) => {
				const tab = allTabs.find((t) => t.id === tabId);
				if (!tab) return null;
				const isActive = tabId === activeTabId;
				return (
					<div
						key={tabId}
						className="absolute inset-0"
						style={{
							visibility: isActive ? "visible" : "hidden",
							pointerEvents: isActive ? "auto" : "none",
							zIndex: isActive ? 1 : 0,
						}}
					>
						<TabView tab={tab} />
					</div>
				);
			})}
		</div>
	);
}
