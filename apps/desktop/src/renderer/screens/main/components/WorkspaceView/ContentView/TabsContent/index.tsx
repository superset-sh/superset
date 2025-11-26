import { useMemo } from "react";
import { trpc } from "renderer/lib/trpc";
import { TabType, useActiveTabIds, useTabs } from "renderer/stores";
import { DropOverlay } from "./DropOverlay";
import { EmptyTabView } from "./EmptyTabView";
import { GroupTabView } from "./GroupTabView";
import { SingleTabView } from "./SingleTabView";
import { useTabContentDrop } from "./useTabContentDrop";

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
						{tab.type === TabType.Single ? (
							<SingleTabView tab={tab} isDropZone={false} />
						) : (
							<GroupTabView tab={tab} />
						)}
					</div>
				))}
			</div>
		);
	}

	return (
		<div ref={attachDrop} className="flex-1 h-full relative">
			{/* Render all workspace tabs - active visible, others hidden (xterm.js auto-pauses) */}
			{workspaceTabs.map((tab) => {
				const isActive = tab.id === tabToRender.id;
				return (
					<div
						key={tab.id}
						className="w-full h-full absolute inset-0"
						style={{
							visibility: isActive ? "visible" : "hidden",
							pointerEvents: isActive ? "auto" : "none",
						}}
					>
						{tab.type === TabType.Single ? (
							<SingleTabView tab={tab} isDropZone={isActive && isDropZone} />
						) : (
							<GroupTabView tab={tab} />
						)}
					</div>
				);
			})}
			{isDropZone && <DropOverlay message="Drop to create split view" />}
		</div>
	);
}
