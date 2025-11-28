import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import {
	useActiveTabIds,
	useAddTab,
	useRemoveTab,
	useSetActiveTab,
	useTabs,
} from "renderer/stores";
import { HOTKEYS } from "shared/hotkeys";
import { ContentView } from "./ContentView";
import { Sidebar } from "./Sidebar";

export function WorkspaceView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabs();
	const activeTabIds = useActiveTabIds();
	const addTab = useAddTab();
	const setActiveTab = useSetActiveTab();
	const removeTab = useRemoveTab();

	const tabs = useMemo(
		() =>
			activeWorkspaceId
				? allTabs.filter(
						(tab) => tab.workspaceId === activeWorkspaceId && !tab.parentId,
					)
				: [],
		[activeWorkspaceId, allTabs],
	);

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;

	// Terminal management shortcuts
	useHotkeys(HOTKEYS.NEW_TERMINAL.keys, () => {
		if (activeWorkspaceId) {
			addTab(activeWorkspaceId);
		}
	}, [activeWorkspaceId, addTab]);

	useHotkeys(HOTKEYS.CLOSE_TERMINAL.keys, () => {
		if (activeTabId) {
			removeTab(activeTabId);
		}
	}, [activeTabId, removeTab]);

	// Switch between visible terminal panes (⌘+Up/Down)
	useHotkeys(HOTKEYS.PREV_TERMINAL.keys, () => {
		if (!activeWorkspaceId || !activeTabId) return;
		const index = tabs.findIndex((t) => t.id === activeTabId);
		if (index > 0) {
			setActiveTab(activeWorkspaceId, tabs[index - 1].id);
		}
	}, [activeWorkspaceId, activeTabId, tabs, setActiveTab]);

	useHotkeys(HOTKEYS.NEXT_TERMINAL.keys, () => {
		if (!activeWorkspaceId || !activeTabId) return;
		const index = tabs.findIndex((t) => t.id === activeTabId);
		if (index < tabs.length - 1) {
			setActiveTab(activeWorkspaceId, tabs[index + 1].id);
		}
	}, [activeWorkspaceId, activeTabId, tabs, setActiveTab]);

	return (
		<div className="flex flex-1 bg-tertiary">
			<Sidebar />
			<div className="flex-1 m-3 bg-background rounded p-2">
				<ContentView />
			</div>
		</div>
	);
}
