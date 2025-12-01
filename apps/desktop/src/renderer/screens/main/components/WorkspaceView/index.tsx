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

	// Open in last used app shortcut
	const { data: lastUsedApp = "cursor" } =
		trpc.settings.getLastUsedApp.useQuery();
	const openInApp = trpc.external.openInApp.useMutation();
	useHotkeys("meta+o", () => {
		if (activeWorkspace?.worktreePath) {
			openInApp.mutate({
				path: activeWorkspace.worktreePath,
				app: lastUsedApp,
			});
		}
	}, [activeWorkspace?.worktreePath, lastUsedApp]);

	// Copy path shortcut
	const copyPath = trpc.external.copyPath.useMutation();
	useHotkeys("meta+shift+c", () => {
		if (activeWorkspace?.worktreePath) {
			copyPath.mutate(activeWorkspace.worktreePath);
		}
	}, [activeWorkspace?.worktreePath]);

	return (
		<div className="flex flex-1 bg-tertiary">
			<Sidebar />
			<div className="flex-1 m-3 bg-background rounded flex flex-col overflow-hidden">
				<div className="flex-1 p-2 overflow-hidden">
					<ContentView />
				</div>
			</div>
		</div>
	);
}
