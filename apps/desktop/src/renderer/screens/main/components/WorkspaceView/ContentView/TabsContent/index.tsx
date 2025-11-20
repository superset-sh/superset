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

	const activeTab = useMemo(() => {
		if (!activeWorkspaceId) return null;
		const activeTabId = activeTabIds[activeWorkspaceId];
		if (!activeTabId) return null;
		return allTabs.find((tab) => tab.id === activeTabId) || null;
	}, [activeWorkspaceId, activeTabIds, allTabs]);

	if (!activeTab) {
		return <EmptyTabView />;
	}

	if (activeTab.type === TabType.Single) {
		return <SingleTabView tab={activeTab} />;
	}

	return <GroupTabView tab={activeTab} />;
}
