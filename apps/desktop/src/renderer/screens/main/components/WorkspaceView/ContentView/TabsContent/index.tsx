import { useMemo } from "react";
import {
	TabType,
	useActiveTabIds,
	useTabs,
	useWorkspacesStore,
} from "renderer/stores";
import { EmptyTabView } from "./EmptyTabView";
import { GroupTabView } from "./GroupTabView";
import { SingleTabView } from "./SingleTabView";
import { useTabContentDrop } from "./useTabContentDrop";
import { DropOverlay } from "./DropOverlay";

export function TabsContent() {
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
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
			{tabToRender.type === TabType.Single ? (
				<>
					<SingleTabView tab={tabToRender} isDropZone={isDropZone} />
					{isDropZone && <DropOverlay message="Drop to create split view" />}
				</>
			) : (
				<>
					<GroupTabView tab={tabToRender} />
					{isDropZone && <DropOverlay message="Drop to add to split view" />}
				</>
			)}
		</div>
	);
}
