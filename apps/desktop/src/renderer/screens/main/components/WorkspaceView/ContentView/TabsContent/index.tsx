import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useSidebarStore } from "renderer/stores";
import {
	MAX_SIDEBAR_WIDTH,
	MIN_SIDEBAR_WIDTH,
} from "renderer/stores/sidebar-state";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ResizablePanel } from "../../../ResizablePanel";
import { Sidebar } from "../../Sidebar";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);

	const {
		isSidebarOpen,
		sidebarWidth,
		setSidebarWidth,
		isResizing,
		setIsResizing,
	} = useSidebarStore();

	// Get all tabs for the current workspace (not just active)
	// We render all tabs but only show the active one via CSS.
	// This keeps terminal subscriptions alive so no data is lost when switching tabs.
	const workspaceTabs = useMemo(() => {
		if (!activeWorkspaceId) return [];
		return allTabs.filter((tab) => tab.workspaceId === activeWorkspaceId);
	}, [activeWorkspaceId, allTabs]);

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;

	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			<div className="flex-1 min-w-0 overflow-hidden relative">
				{workspaceTabs.length > 0 ? (
					workspaceTabs.map((tab) => (
						<div
							key={tab.id}
							className="absolute inset-0"
							style={{
								visibility: tab.id === activeTabId ? "visible" : "hidden",
								// Use visibility instead of display:none to keep terminals mounted
								// but avoid layout calculations for hidden tabs
								pointerEvents: tab.id === activeTabId ? "auto" : "none",
							}}
						>
							<TabView tab={tab} />
						</div>
					))
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
