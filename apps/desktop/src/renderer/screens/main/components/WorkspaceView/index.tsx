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

	// Tab management shortcuts - work even when sidebar is closed
	useHotkeys("meta+t", () => {
		if (activeWorkspaceId) {
			addTab(activeWorkspaceId);
		}
	}, [activeWorkspaceId, addTab]);

	useHotkeys("meta+w", () => {
		if (activeTabId) {
			removeTab(activeTabId);
		}
	}, [activeTabId, removeTab]);

	useHotkeys("meta+alt+up", () => {
		if (!activeWorkspaceId || !activeTabId) return;
		const index = tabs.findIndex((t) => t.id === activeTabId);
		if (index > 0) {
			setActiveTab(activeWorkspaceId, tabs[index - 1].id);
		}
	}, [activeWorkspaceId, activeTabId, tabs, setActiveTab]);

	useHotkeys("meta+alt+down", () => {
		if (!activeWorkspaceId || !activeTabId) return;
		const index = tabs.findIndex((t) => t.id === activeTabId);
		if (index < tabs.length - 1) {
			setActiveTab(activeWorkspaceId, tabs[index + 1].id);
		}
	}, [activeWorkspaceId, activeTabId, tabs, setActiveTab]);

	// Jump to tab by number (Cmd+1 through Cmd+9)
	useHotkeys(
		"meta+1,meta+2,meta+3,meta+4,meta+5,meta+6,meta+7,meta+8,meta+9",
		(_, handler) => {
			if (!activeWorkspaceId) return;
			const key = handler.keys?.join("");
			const num = key ? Number.parseInt(key, 10) : null;
			if (num && tabs[num - 1]) {
				setActiveTab(activeWorkspaceId, tabs[num - 1].id);
			}
		},
		[activeWorkspaceId, tabs, setActiveTab],
	);

	return (
		<div className="flex flex-1 bg-tertiary">
			<Sidebar />
			<div className="flex-1 m-3 bg-background rounded p-2">
				<ContentView />
			</div>
		</div>
	);
}
