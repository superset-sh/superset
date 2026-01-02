import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { DEFAULT_NAVIGATION_STYLE } from "shared/constants";
import { SidebarControl } from "../../../SidebarControl";
import { EmptyTabView } from "./EmptyTabView";
import { GroupStrip } from "./GroupStrip";
import { TabView } from "./TabView";

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const panes = useTabsStore((s) => s.panes);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);

	// Get navigation style to conditionally show sidebar toggle
	const { data: navigationStyle } = trpc.settings.getNavigationStyle.useQuery();
	const isSidebarMode =
		(navigationStyle ?? DEFAULT_NAVIGATION_STYLE) === "sidebar";

	const tabToRender = useMemo(() => {
		if (!activeWorkspaceId) return null;
		const activeTabId = activeTabIds[activeWorkspaceId];
		if (!activeTabId) return null;

		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	if (!tabToRender) {
		return <EmptyTabView />;
	}

	return (
		<div className="h-full flex flex-col overflow-hidden">
			<div className="flex items-end bg-background shrink-0">
				{isSidebarMode && (
					<div className="flex items-center h-10 pl-2">
						<SidebarControl />
					</div>
				)}
				<GroupStrip />
			</div>
			<div className="flex-1 min-h-0 overflow-hidden">
				<TabView tab={tabToRender} panes={panes} />
			</div>
		</div>
	);
}
