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

export function TabsContent() {
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
	const allTabs = useTabs();
	const activeTabIds = useActiveTabIds();

	const { tabToRender, focusedChildId } = useMemo(() => {
		if (!activeWorkspaceId) return { tabToRender: null, focusedChildId: null };
		const activeTabId = activeTabIds[activeWorkspaceId];
		if (!activeTabId) return { tabToRender: null, focusedChildId: null };

		const activeTab = allTabs.find((tab) => tab.id === activeTabId);
		if (!activeTab) return { tabToRender: null, focusedChildId: null };

		if (activeTab.parentId) {
			const parentGroup = allTabs.find((tab) => tab.id === activeTab.parentId);
			return {
				tabToRender: parentGroup || null,
				focusedChildId: activeTabId,
			};
		}

		return { tabToRender: activeTab, focusedChildId: null };
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	if (!tabToRender) {
		return <EmptyTabView />;
	}

	if (tabToRender.type === TabType.Single) {
		return <SingleTabView tab={tabToRender} />;
	}

	return <GroupTabView tab={tabToRender} />;
}
