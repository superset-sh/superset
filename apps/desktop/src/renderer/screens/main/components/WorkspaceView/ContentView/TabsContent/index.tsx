import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import type { Tab } from "renderer/stores";
import { TabType, useActiveTabIds, useTabs } from "renderer/stores";
import { DropOverlay } from "./DropOverlay";
import { EmptyTabView } from "./EmptyTabView";
import { GroupTabView } from "./GroupTabView";
import { SetupTabView } from "./SetupTabView";
import { SingleTabView } from "./SingleTabView";
import { useTabContentDrop } from "./useTabContentDrop";

interface RenderTabContentProps {
	tab: Tab;
	activeTabId: string | null;
	isDropZone: boolean;
}

function renderTabContent({
	tab,
	activeTabId,
	isDropZone,
}: RenderTabContentProps) {
	const isActive = tab.id === activeTabId;
	const content = (() => {
		switch (tab.type) {
			case TabType.Setup:
				return <SetupTabView tab={tab} />;
			case TabType.Single:
				return <SingleTabView tab={tab} isDropZone={isActive && isDropZone} />;
			case TabType.Group:
				return <GroupTabView tab={tab} />;
			default:
				return null;
		}
	})();

	const style: React.CSSProperties = {
		visibility: isActive ? "visible" : "hidden",
		pointerEvents: isActive ? "auto" : "none",
	};

	return (
		<div className="w-full h-full absolute inset-0" style={style}>
			{content}
		</div>
	);
}

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabs();
	const activeTabIds = useActiveTabIds();

	const { tabToRender, allTabs: renderedTabs } = useMemo(() => {
		if (!activeWorkspaceId) return { tabToRender: null, allTabs: [] };
		const activeTabId = activeTabIds[activeWorkspaceId];

		// Get all top-level tabs (tabs without parent)
		const topLevelTabs = allTabs.filter((tab) => !tab.parentId);

		if (!activeTabId) {
			return { tabToRender: null, allTabs: topLevelTabs };
		}

		const activeTab = allTabs.find((tab) => tab.id === activeTabId);
		if (!activeTab) {
			return { tabToRender: null, allTabs: topLevelTabs };
		}

		let displayTab = activeTab;
		if (activeTab.parentId) {
			const parentGroup = allTabs.find((tab) => tab.id === activeTab.parentId);
			displayTab = parentGroup || activeTab;
		}

		return { tabToRender: displayTab, allTabs: topLevelTabs };
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	const { isDropZone, attachDrop } = useTabContentDrop(tabToRender);

	const activeTabId = tabToRender?.id ?? null;

	if (!tabToRender) {
		return (
			<div ref={attachDrop} className="flex-1 h-full relative">
				<EmptyTabView />
				{renderedTabs.map((tab) => {
					return (
						<div key={tab.id}>
							{renderTabContent({
								tab,
								activeTabId: null,
								isDropZone: false,
							})}
						</div>
					);
				})}
			</div>
		);
	}

	const dropOverlayMessage =
		tabToRender.type === TabType.Single
			? "Drop to create split view"
			: "Drop to add to split view";

	return (
		<div ref={attachDrop} className="flex-1 h-full relative">
			{renderedTabs.map((tab) => {
				return (
					<div key={tab.id}>
						{renderTabContent({
							tab,
							activeTabId,
							isDropZone,
						})}
					</div>
				);
			})}
			{isDropZone && <DropOverlay message={dropOverlayMessage} />}
		</div>
	);
}
