import { ResizablePanel, ResizablePanelGroup } from "@superset/ui/resizable";
import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { ChatPanelResizable } from "./ChatPanel";
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

	if (!tabToRender) {
		return <EmptyTabView />;
	}

	return (
		<ResizablePanelGroup direction="horizontal" className="flex-1 h-full">
			<ResizablePanel defaultSize={70} minSize={30}>
				<TabView tab={tabToRender} panes={panes} />
			</ResizablePanel>
			<ChatPanelResizable />
		</ResizablePanelGroup>
	);
}
