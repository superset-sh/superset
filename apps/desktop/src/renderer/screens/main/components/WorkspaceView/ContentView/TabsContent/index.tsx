import { trpc } from "renderer/lib/trpc";
import { DropOverlay } from "./DropOverlay";
import { EmptyTabView } from "./EmptyTabView";
import { GroupTabView } from "./GroupTabView";
import { SingleTabView } from "./SingleTabView";
import { useTabContentDrop } from "./useTabContentDrop";

export function TabsContent() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const { data: allTabs = [] } = trpc.tabs.getByWorkspace.useQuery(
		{ workspaceId: activeWorkspaceId! },
		{ enabled: !!activeWorkspaceId },
	);

	let tabToRender = null;
	if (activeWorkspace?.activeTabId) {
		const activeTab = allTabs.find(
			(tab) => tab.id === activeWorkspace.activeTabId,
		);
		if (activeTab) {
			if (activeTab.parentId) {
				const parentGroup = allTabs.find(
					(tab) => tab.id === activeTab.parentId,
				);
				tabToRender = parentGroup || null;
			} else {
				tabToRender = activeTab;
			}
		}
	}

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
			{tabToRender.type === "terminal" ? (
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
