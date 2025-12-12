import {
	ResizableHandle,
	ResizablePanel,
	ResizablePanelGroup,
} from "@superset/ui/resizable";
import { useEffect, useMemo, useRef } from "react";
import { useHotkeys } from "react-hotkeys-hook";
import type { ImperativePanelHandle } from "react-resizable-panels";
import { trpc } from "renderer/lib/trpc";
import { useSidebarStore } from "renderer/stores";
import { useTabsStore } from "renderer/stores/tabs/store";
import { HOTKEYS } from "shared/hotkeys";
import { ContentView } from "./ContentView";
import { Sidebar } from "./Sidebar";

export function WorkspaceView() {
	const { data: activeWorkspace } = trpc.workspaces.getActive.useQuery();
	const activeWorkspaceId = activeWorkspace?.id;
	const allTabs = useTabsStore((s) => s.tabs);
	const activeTabIds = useTabsStore((s) => s.activeTabIds);
	const focusedPaneIds = useTabsStore((s) => s.focusedPaneIds);
	const addTab = useTabsStore((s) => s.addTab);
	const setActiveTab = useTabsStore((s) => s.setActiveTab);
	const removePane = useTabsStore((s) => s.removePane);

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

	const { isSidebarOpen, sidebarSize, setSidebarSize, setIsResizing } =
		useSidebarStore();
	const sidebarPanelRef = useRef<ImperativePanelHandle>(null);

	useEffect(() => {
		const panel = sidebarPanelRef.current;
		if (!panel) return;

		if (isSidebarOpen) {
			panel.expand();
		} else {
			panel.collapse();
		}
	}, [isSidebarOpen]);

	return (
		<ResizablePanelGroup direction="horizontal" className="flex-1 bg-tertiary">
			<ResizablePanel
				ref={sidebarPanelRef}
				defaultSize={sidebarSize}
				minSize={10}
				maxSize={40}
				collapsible
				collapsedSize={0}
				onCollapse={() => setSidebarSize(0)}
				onExpand={() => setSidebarSize(15)}
				onResize={setSidebarSize}
			>
				{isSidebarOpen && <Sidebar />}
			</ResizablePanel>
			<ResizableHandle
				className="bg-tertiary hover:bg-border transition-colors"
				onDragging={setIsResizing}
			/>
			<ResizablePanel defaultSize={100 - sidebarSize}>
				<div className="flex-1 h-full p-1">
					<div className="h-full bg-background rounded-lg flex flex-col overflow-hidden">
						<ContentView />
					</div>
				</div>
			</ResizablePanel>
		</ResizablePanelGroup>
	);
}
