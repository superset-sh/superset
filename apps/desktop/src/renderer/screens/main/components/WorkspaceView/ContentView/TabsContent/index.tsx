import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { TabType, useActiveTabIds, useTabs } from "renderer/stores";
import { DropOverlay } from "./DropOverlay";
import { EmptyTabView } from "./EmptyTabView";
import { GroupTabView } from "./GroupTabView";
import { SingleTabView } from "./SingleTabView";
import { useTabContentDrop } from "./useTabContentDrop";
import { WebViewTabView } from "./WebViewTabView";

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabs();
	const activeTabIds = useActiveTabIds();

	const tabToRender = useMemo(() => {
		if (!activeWorkspaceId) return null;
		const activeTabId = activeTabIds[activeWorkspaceId];
		if (!activeTabId) return null;

		const activeTab = allTabs.find((tab) => tab.id === activeTabId);
		if (!activeTab) return null;

		if (activeTab.parentId) {
			const parentGroup = allTabs.find((tab) => tab.id === activeTab.parentId);
			return parentGroup || null;
		}

		return activeTab;
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	const { isDropZone, attachDrop } = useTabContentDrop(tabToRender);

	if (!tabToRender) {
		return (
			<div ref={attachDrop} className="flex-1 h-full">
				<EmptyTabView />
			</div>
		);
	}

	return (
		<div ref={attachDrop} className="flex-1 h-full relative">
			{tabToRender.type === TabType.Single && (
				<SingleTabView tab={tabToRender} isDropZone={isDropZone} />
			)}
			{tabToRender.type === TabType.Group && <GroupTabView tab={tabToRender} />}
			{tabToRender.type === TabType.WebView && (
				<WebViewTabView tab={tabToRender} />
			)}
			{isDropZone && <DropOverlay message="Drop to create split view" />}
		</div>
	);
}
