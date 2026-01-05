import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ResizableSidebar } from "../../../WorkspaceView/ResizableSidebar";
import { EmptyTabView } from "./EmptyTabView";
import { TabView } from "./TabView";

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);

	const tabToRender = useMemo(() => {
		if (!activeWorkspaceId) return null;
		const activeTabId = activeTabIds[activeWorkspaceId];
		if (!activeTabId) return null;

		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	return (
		<div className="flex-1 min-h-0 flex overflow-hidden">
			<div className="flex-1 min-w-0 overflow-hidden">
				{tabToRender ? (
					<TabView tab={tabToRender} panes={panes} />
				) : (
					<EmptyTabView />
				)}
			</div>
			<ResizableSidebar />
		</div>
	);
}
