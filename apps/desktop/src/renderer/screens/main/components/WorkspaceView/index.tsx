import { useMemo } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import { trpc } from "renderer/lib/trpc";
import { useTabsStore } from "renderer/stores/tabs/store";
import { getNextPaneId, getPreviousPaneId } from "renderer/stores/tabs/utils";
import { HOTKEYS } from "shared/hotkeys";
import { ContentView } from "./ContentView";
import { ResizableSidebar } from "./ResizableSidebar";
import { WorkspaceFooter } from "./WorkspaceFooter";

export function WorkspaceView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const addTab = useTabsStore((s) => s.addTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const removePane = useTabsStore((s) => s.removePane);
	const setFocusedPane = useTabsStore((s) => s.setFocusedPane);

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

	// Get the active tab object for layout access
	const activeTab = useMemo(
		() => (activeTabId ? tabs.find((t) => t.id === activeTabId) : null),
		[activeTabId, tabs],
	);

	// Get focused pane ID for the active tab
	const focusedPaneId = activeTabId ? focusedPaneIds[activeTabId] : null;

	// Tab management shortcuts
	useHotkeys(HOTKEYS.NEW_TERMINAL.keys, () => {
		if (activeWorkspaceId) {
			addTab(activeWorkspaceId);
		}
	}, [activeWorkspaceId, addTab]);

	useHotkeys(HOTKEYS.CLOSE_TERMINAL.keys, () => {
		// Close focused pane (which may close the tab if it's the last pane)
		if (focusedPaneId) {
			removePane(focusedPaneId);
		}
	}, [focusedPaneId, removePane]);

	// Switch between tabs (⌘+Up/Down)
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

	// Switch between panes within a tab (⌘+⌥+Left/Right)
	useHotkeys(HOTKEYS.PREV_PANE.keys, () => {
		if (!activeTabId || !activeTab?.layout || !focusedPaneId) return;
		const prevPaneId = getPreviousPaneId(activeTab.layout, focusedPaneId);
		if (prevPaneId) {
			setFocusedPane(activeTabId, prevPaneId);
		}
	}, [activeTabId, activeTab?.layout, focusedPaneId, setFocusedPane]);

	useHotkeys(HOTKEYS.NEXT_PANE.keys, () => {
		if (!activeTabId || !activeTab?.layout || !focusedPaneId) return;
		const nextPaneId = getNextPaneId(activeTab.layout, focusedPaneId);
		if (nextPaneId) {
			setFocusedPane(activeTabId, nextPaneId);
		}
	}, [activeTabId, activeTab?.layout, focusedPaneId, setFocusedPane]);

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
		<div className="flex-1 h-full flex flex-col overflow-hidden">
			<div className="flex-1 flex bg-tertiary overflow-hidden">
				<ResizableSidebar />
				<div className="flex-1 min-w-0 h-full bg-background rounded-t-lg flex flex-col overflow-hidden">
					<div className="flex-1 min-h-0 overflow-hidden">
						<ContentView />
					</div>
					<WorkspaceFooter worktreePath={activeWorkspace?.worktreePath} />
				</div>
			</div>
		</div>
	);
}
