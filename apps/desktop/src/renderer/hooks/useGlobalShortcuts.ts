import { useEffect } from "react";
import { createShortcutHandler } from "../lib/keyboard-shortcuts";
import {
	createSplitPaneShortcuts,
	createTabShortcuts,
	createWorkspaceShortcuts,
} from "../lib/shortcuts";
import { useSidebarStore } from "../stores/sidebar-state";
import {
	useActiveTabIds,
	useAddTab,
	useRemoveTab,
	useSetActiveTab,
	useTabs,
} from "../stores/tabs";
import { useWorkspacesStore } from "../stores/workspaces";

/**
 * Global keyboard shortcuts hook
 * Handles all app-wide keyboard shortcuts for workspaces, tabs, and panes
 */
export function useGlobalShortcuts() {
	const { workspaces, activeWorkspaceId, setActiveWorkspace } =
		useWorkspacesStore();
	const { toggleSidebar } = useSidebarStore();
	const tabs = useTabs();
	const activeTabIds = useActiveTabIds();
	const setActiveTab = useSetActiveTab();
	const addTab = useAddTab();
	const removeTab = useRemoveTab();

	useEffect(() => {
		// Workspace navigation handlers
		const workspaceHandlers = {
			switchToPrevWorkspace: () => {
				if (!activeWorkspaceId) return;
				const currentIndex = workspaces.findIndex(
					(w) => w.id === activeWorkspaceId,
				);
				if (currentIndex > 0) {
					setActiveWorkspace(workspaces[currentIndex - 1].id);
				}
			},
			switchToNextWorkspace: () => {
				if (!activeWorkspaceId) return;
				const currentIndex = workspaces.findIndex(
					(w) => w.id === activeWorkspaceId,
				);
				if (currentIndex < workspaces.length - 1) {
					setActiveWorkspace(workspaces[currentIndex + 1].id);
				}
			},
			toggleSidebar,
			splitVertical: () => {
				// TODO: Implement split vertical
				console.log("Split vertical");
			},
			splitHorizontal: () => {
				// TODO: Implement split horizontal
				console.log("Split horizontal");
			},
		};

		// Get current workspace tabs and active tab
		const workspaceTabs = activeWorkspaceId
			? tabs.filter((t) => t.workspaceId === activeWorkspaceId && !t.parentId)
			: [];
		const activeTabId = activeWorkspaceId
			? activeTabIds[activeWorkspaceId]
			: null;

		// Tab management handlers
		const tabHandlers = {
			switchToPrevTab: () => {
				if (!activeWorkspaceId || !activeTabId) return;
				const currentIndex = workspaceTabs.findIndex(
					(t) => t.id === activeTabId,
				);
				if (currentIndex > 0) {
					setActiveTab(activeWorkspaceId, workspaceTabs[currentIndex - 1].id);
				}
			},
			switchToNextTab: () => {
				if (!activeWorkspaceId || !activeTabId) return;
				const currentIndex = workspaceTabs.findIndex(
					(t) => t.id === activeTabId,
				);
				if (currentIndex < workspaceTabs.length - 1) {
					setActiveTab(activeWorkspaceId, workspaceTabs[currentIndex + 1].id);
				}
			},
			newTab: () => {
				if (!activeWorkspaceId) return;
				addTab(activeWorkspaceId);
			},
			closeTab: () => {
				if (!activeWorkspaceId || !activeTabId) return;
				removeTab(activeTabId);
			},
			reopenClosedTab: () => {
				// TODO: Implement reopen closed tab (requires history tracking)
				console.log("Reopen closed tab");
			},
			jumpToTab: (index: number) => {
				if (!activeWorkspaceId) return;
				const targetTab = workspaceTabs[index - 1];
				if (targetTab) {
					setActiveTab(activeWorkspaceId, targetTab.id);
				}
			},
		};

		// Split pane navigation handlers
		const splitPaneHandlers = {
			focusPaneLeft: () => {
				// TODO: Implement focus pane left
				console.log("Focus pane left");
			},
			focusPaneRight: () => {
				// TODO: Implement focus pane right
				console.log("Focus pane right");
			},
			focusPaneUp: () => {
				// TODO: Implement focus pane up
				console.log("Focus pane up");
			},
			focusPaneDown: () => {
				// TODO: Implement focus pane down
				console.log("Focus pane down");
			},
		};

		// Create shortcut groups
		const workspaceShortcuts = createWorkspaceShortcuts(workspaceHandlers);
		const tabShortcuts = createTabShortcuts(tabHandlers);
		const splitPaneShortcuts = createSplitPaneShortcuts(splitPaneHandlers);

		// Combine all shortcuts
		const allShortcuts = [
			...workspaceShortcuts.shortcuts,
			...tabShortcuts.shortcuts,
			...splitPaneShortcuts.shortcuts,
		];

		// Register keyboard event handler
		const handleKeyDown = createShortcutHandler(allShortcuts);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		workspaces,
		activeWorkspaceId,
		tabs,
		activeTabIds,
		setActiveWorkspace,
		toggleSidebar,
		setActiveTab,
		addTab,
		removeTab,
	]);
}
