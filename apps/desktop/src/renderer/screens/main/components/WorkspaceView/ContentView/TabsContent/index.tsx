import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import type { SetupTab } from "renderer/stores";
import { TabType, useActiveTabIds, useTabs } from "renderer/stores";
import { DropOverlay } from "./DropOverlay";
import { EmptyTabView } from "./EmptyTabView";
import { GroupTabView } from "./GroupTabView";
import { SetupTabView } from "./SetupTabView";
import { SingleTabView } from "./SingleTabView";
import { useTabContentDrop } from "./useTabContentDrop";

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

	// Get all setup tabs to keep them mounted (so they can complete and auto-close)
	const setupTabs = useMemo(() => {
		if (!activeWorkspaceId) return [];
		return allTabs.filter(
			(tab): tab is SetupTab =>
				tab.type === TabType.Setup && tab.workspaceId === activeWorkspaceId,
		);
	}, [allTabs, activeWorkspaceId]);

	const { isDropZone, attachDrop } = useTabContentDrop(tabToRender);

	if (!tabToRender) {
		return (
			<div ref={attachDrop} className="flex-1 h-full">
				<EmptyTabView />
				{/* Keep setup tabs mounted so they can complete and auto-close */}
				{setupTabs.map((tab) => (
					<div key={tab.id} className="hidden">
						<SetupTabView tab={tab} />
					</div>
				))}
			</div>
		);
	}

	return (
		<div ref={attachDrop} className="flex-1 h-full relative">
			{/* Keep all setup tabs mounted (hidden when not active) so they can complete and auto-close */}
			{setupTabs.map((tab) => (
				<div
					key={tab.id}
					className={tabToRender.id === tab.id ? "h-full w-full" : "hidden"}
				>
					<SetupTabView tab={tab} />
				</div>
			))}
			{tabToRender.type === TabType.Single && (
				<SingleTabView tab={tabToRender} isDropZone={isDropZone} />
			)}
			{tabToRender.type === TabType.Group && <GroupTabView tab={tabToRender} />}
			{isDropZone && <DropOverlay message="Drop to create split view" />}
		</div>
	);
}
