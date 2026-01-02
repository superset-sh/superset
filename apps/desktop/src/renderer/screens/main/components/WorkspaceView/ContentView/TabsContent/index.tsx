import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: terminalPersistence } =
		trpc.settings.getTerminalPersistence.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;

	// Get all tabs for current workspace (for fallback/empty check)
	const currentWorkspaceTabs = useMemo(() => {
		if (!activeWorkspaceId) return [];
		return allTabs.filter((tab) => tab.workspaceId === activeWorkspaceId);
	}, [activeWorkspaceId, allTabs]);

	const tabToRender = useMemo(() => {
		if (!activeTabId) return null;
		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeTabId, allTabs]);

	// When terminal persistence is enabled, keep all terminals mounted across
	// workspace/tab switches. This prevents TUI white screen issues by avoiding
	// the unmount/remount cycle that requires complex reattach/rehydration logic.
	// Uses visibility:hidden (not display:none) to preserve xterm dimensions.
	if (terminalPersistence) {
		// Show empty view only if current workspace has no tabs
		if (currentWorkspaceTabs.length === 0) {
			return <EmptyTabView />;
		}

		return (
			<div className="relative h-full w-full">
				{allTabs.map((tab) => {
					// A tab is visible only if:
					// 1. It belongs to the active workspace AND
					// 2. It's the active tab for that workspace
					const isVisible =
						tab.workspaceId === activeWorkspaceId && tab.id === activeTabId;

					return (
						<div
							key={tab.id}
							className="absolute inset-0"
							style={{
								visibility: isVisible ? "visible" : "hidden",
								pointerEvents: isVisible ? "auto" : "none",
							}}
						>
							<TabView tab={tab} panes={panes} />
						</div>
					);
				})}
			</div>
		);
	}

	// Original behavior when persistence disabled: only render active tab
	if (!tabToRender) {
		return <EmptyTabView />;
	}

	return (
		<div className="flex-1 min-h-0 overflow-hidden">
			<TabView tab={tabToRender} panes={panes} />
		</div>
	);
}
