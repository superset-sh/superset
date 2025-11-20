import { Button } from "@superset/ui/button";
import { useMemo } from "react";
import { HiMiniPlus } from "react-icons/hi2";
import {
	useActiveTabIds,
	useAddTab,
	useTabs,
	useWorkspacesStore,
} from "renderer/stores";
import { TabItem } from "./TabItem";

export function TabsView() {
	const activeWorkspaceId = useWorkspacesStore(
		(state) => state.activeWorkspaceId,
	);
	const allTabs = useTabs();
	const activeTabIds = useActiveTabIds();
	const addTab = useAddTab();

	const tabs = useMemo(
		() =>
			activeWorkspaceId
				? allTabs.filter((tab) => tab.workspaceId === activeWorkspaceId)
				: [],
		[activeWorkspaceId, allTabs],
	);

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;

	const handleAddTab = () => {
		if (activeWorkspaceId) {
			addTab(activeWorkspaceId);
		}
	};

	return (
		<nav className="space-y-2 flex flex-col h-full p-2">
			<div className="text-sm text-sidebar-foreground flex-1 overflow-auto space-y-1">
				{tabs.map((tab) => (
					<TabItem key={tab.id} tab={tab} isActive={tab.id === activeTabId} />
				))}
				<Button
					variant="ghost"
					onClick={handleAddTab}
					className="w-full text-start group px-3 py-2 rounded-md cursor-pointer flex items-center justify-between"
					disabled={!activeWorkspaceId}
				>
					<HiMiniPlus className="size-4" />
					<span className="truncate flex-1">New Tab</span>
				</Button>
			</div>
		</nav>
	);
}
