import { useEffect, useMemo, useState } from "react";
import { trpc } from "renderer/lib/trpc";
import { useSidebarStore } from "renderer/stores";
import {
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
} from "renderer/stores/sidebar-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import type { Pane, Tab } from "renderer/stores/tabs/types";
import { extractPaneIdsFromLayout } from "renderer/stores/tabs/utils";
import { ResizablePanel } from "../../../ResizablePanel";
import { Sidebar } from "../../Sidebar";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

const WARM_TERMINAL_TAB_LIMIT = 8;

/**
 * Check if a tab contains at least one terminal pane.
 * Used to determine which tabs need to stay mounted for persistence.
 */
function hasTerminalPane(tab: Tab, panes: Record<string, Pane>): boolean {
	const paneIds = extractPaneIdsFromLayout(tab.layout);
	return paneIds.some((paneId) => panes[paneId]?.type === "terminal");
}

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const { data: terminalPersistence } =
		trpc.settings.getTerminalPersistence.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const panes = useTabsStore((s) => s.panes);

	const {
		isSidebarOpen,
		sidebarWidth,
		setSidebarWidth,
		isResizing,
		setIsResizing,
	} = useSidebarStore();

	const activeTabId = useMemo(() => {
		if (!activeWorkspaceId) return null;

		// Prefer the store's active tab, but fall back to the first tab to avoid a
		// blank render when activeTabIds isn't hydrated yet.
		return (
			activeTabIds[activeWorkspaceId] ??
			allTabs.find((tab) => tab.workspaceId === activeWorkspaceId)?.id ??
			null
		);
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	const tabToRender = useMemo(() => {
		if (!activeTabId) return null;
		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeTabId, allTabs]);

	const activeTabHasTerminal = useMemo(() => {
		if (!tabToRender) return false;
		return hasTerminalPane(tabToRender, panes);
	}, [tabToRender, panes]);

	// Per-run warm set of terminal tab IDs (MRU order). Not persisted.
	const [warmTerminalTabIds, setWarmTerminalTabIds] = useState<string[]>([]);

	// Track terminal tab visits to keep a bounded set mounted for smooth switching.
	useEffect(() => {
		if (!terminalPersistence) return;
		if (!activeTabId) return;
		if (!activeTabHasTerminal) return;

		setWarmTerminalTabIds((prev) => {
			const next = [activeTabId, ...prev.filter((id) => id !== activeTabId)];
			return next.slice(0, WARM_TERMINAL_TAB_LIMIT);
		});
	}, [terminalPersistence, activeTabId, activeTabHasTerminal]);

	// When terminal persistence is enabled, keep a bounded set of terminal tabs
	// mounted across workspace/tab switches. This prevents TUI white screen issues
	// for recently used terminals by avoiding the unmount/remount cycle that
	// requires complex reattach/rehydration, while avoiding startup fan-out.
	// Non-terminal tabs use normal unmount behavior to save memory.
	// Uses visibility:hidden (not display:none) to preserve xterm dimensions.
	if (terminalPersistence) {
		// Partition tabs: a bounded set of terminal tabs stay mounted, non-terminal tabs unmount when inactive.
		const terminalTabs = allTabs.filter((tab) => hasTerminalPane(tab, panes));
		const terminalTabsById = new Map(terminalTabs.map((tab) => [tab.id, tab]));

		const warmIdsFiltered = warmTerminalTabIds.filter((id) =>
			terminalTabsById.has(id),
		);

		// Ensure active terminal tab is included in the mounted set even before the
		// warm-set effect runs (first render after tab switch).
		const terminalTabIdsToRender = (() => {
			const ids = [...warmIdsFiltered];
			if (activeTabHasTerminal && activeTabId && !ids.includes(activeTabId)) {
				ids.unshift(activeTabId);
			}
			return ids.slice(0, WARM_TERMINAL_TAB_LIMIT);
		})();

		const terminalTabsToRender = terminalTabIdsToRender
			.map((id) => terminalTabsById.get(id))
			.filter((tab): tab is Tab => !!tab);

		const activeNonTerminalTab =
			tabToRender && !activeTabHasTerminal ? tabToRender : null;

		return (
			<div className="flex-1 min-h-0 flex overflow-hidden">
				<div className="relative flex-1 min-w-0">
					{/* Terminal tabs: keep mounted with visibility toggle */}
					{terminalTabsToRender.map((tab) => {
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
								<TabView tab={tab} isTabVisible={isVisible} />
							</div>
						);
					})}
					{/* Active non-terminal tab: render normally (unmounts when switching) */}
					{activeNonTerminalTab && (
						<div className="absolute inset-0">
							<TabView tab={activeNonTerminalTab} isTabVisible />
						</div>
					)}
					{/* Fallback: show empty view without unmounting terminal tabs */}
					{!activeNonTerminalTab && !tabToRender && (
						<div className="absolute inset-0 overflow-hidden">
							<EmptyTabView />
						</div>
					)}
				</div>
				{isSidebarOpen && (
					<ResizablePanel
						width={sidebarWidth}
						onWidthChange={setSidebarWidth}
						isResizing={isResizing}
						onResizingChange={setIsResizing}
						minWidth={MIN_SIDEBAR_WIDTH}
						maxWidth={MAX_SIDEBAR_WIDTH}
						handleSide="left"
					>
						<Sidebar />
					</ResizablePanel>
				)}
			</div>
		);
	}

	// Original behavior when persistence disabled: only render active tab
	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			<div className="flex-1 min-w-0 overflow-hidden">
				{tabToRender ? (
					<TabView tab={tabToRender} isTabVisible />
				) : (
					<EmptyTabView />
				)}
			</div>
			{isSidebarOpen && (
				<ResizablePanel
					width={sidebarWidth}
					onWidthChange={setSidebarWidth}
					isResizing={isResizing}
					onResizingChange={setIsResizing}
					minWidth={MIN_SIDEBAR_WIDTH}
					maxWidth={MAX_SIDEBAR_WIDTH}
					handleSide="left"
				>
					<Sidebar />
				</ResizablePanel>
			)}
		</div>
	);
}
