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
	isDropZone: boolean;
}

function renderTabContent({ tab, isDropZone }: RenderTabContentProps) {
	switch (tab.type) {
		case TabType.Setup:
			return <SetupTabView tab={tab} />;
		case TabType.Single:
			return <SingleTabView tab={tab} isDropZone={isDropZone} />;
		case TabType.Group:
			return <GroupTabView tab={tab} />;
		default:
			return null;
	}
}

interface RenderTabsProps {
	tabs: Tab[];
	activeTabId: string | null;
	isDropZone: boolean;
}

function renderTabs({ tabs, activeTabId, isDropZone }: RenderTabsProps) {
	return tabs.map((tab) => {
		const isActive = tab.id === activeTabId;
		return (
			<div
				key={tab.id}
				className="w-full h-full absolute inset-0"
				style={{
					visibility: isActive ? "visible" : "hidden",
					pointerEvents: isActive ? "auto" : "none",
				}}
			>
				{renderTabContent({ tab, isDropZone: isActive && isDropZone })}
			</div>
		);
	});
}

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabs();
	const activeTabIds = useActiveTabIds();

	const { tabToRender, workspaceTabs } = useMemo(() => {
		if (!activeWorkspaceId) return { tabToRender: null, workspaceTabs: [] };
		const activeTabId = activeTabIds[activeWorkspaceId];

		// Get all top-level tabs (tabs without parent) for this workspace
		const workspaceTabs = allTabs.filter(
			(tab) => tab.workspaceId === activeWorkspaceId && !tab.parentId,
		);

		if (!activeTabId) {
			return { tabToRender: null, workspaceTabs };
		}

		const activeTab = allTabs.find((tab) => tab.id === activeTabId);
		if (!activeTab) {
			return { tabToRender: null, workspaceTabs };
		}

		let displayTab = activeTab;
		if (activeTab.parentId) {
			const parentGroup = allTabs.find((tab) => tab.id === activeTab.parentId);
			displayTab = parentGroup || activeTab;
		}

		return { tabToRender: displayTab, workspaceTabs };
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	const { isDropZone, attachDrop } = useTabContentDrop(tabToRender);

	if (!tabToRender) {
		return (
			<div ref={attachDrop} className="flex-1 h-full">
				<EmptyTabView />
				{/* Render all workspace tabs hidden to preserve terminal scrollback */}
				{workspaceTabs.map((tab) => (
					<div
						key={tab.id}
						className="w-full h-full absolute inset-0"
						style={{ visibility: "hidden", pointerEvents: "none" }}
					>
						{renderTabContent({ tab, isDropZone: false })}
					</div>
				))}
			</div>
		);
	}

	const dropOverlayMessage =
		tabToRender.type === TabType.Single
			? "Drop to create split view"
			: "Drop to add to split view";

	return (
		<div ref={attachDrop} className="flex-1 h-full relative">
			{/* Render all workspace tabs - active visible, others hidden (xterm.js auto-pauses) */}
			{renderTabs({
				tabs: workspaceTabs,
				activeTabId: tabToRender.id,
				isDropZone,
			})}
			{isDropZone && <DropOverlay message={dropOverlayMessage} />}
		</div>
	);
}
