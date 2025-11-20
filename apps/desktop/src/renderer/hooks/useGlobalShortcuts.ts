import { useEffect, useMemo } from "react";
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
	useSplitTabHorizontal,
	useSplitTabVertical,
	useTabs,
} from "../stores/tabs";
import { useWorkspacesStore } from "../stores/workspaces";

function findWorkspaceIndex(
	workspaces: Array<{ id: string }>,
	id: string | null,
) {
	if (!id) return -1;
	return workspaces.findIndex((w) => w.id === id);
}

function findTabIndex(tabs: Array<{ id: string }>, id: string | null) {
	if (!id) return -1;
	return tabs.findIndex((t) => t.id === id);
}

export function useGlobalShortcuts() {
	const { workspaces, activeWorkspaceId, setActiveWorkspace } =
		useWorkspacesStore();
	const { toggleSidebar } = useSidebarStore();
	const tabs = useTabs();
	const activeTabIds = useActiveTabIds();
	const setActiveTab = useSetActiveTab();
	const addTab = useAddTab();
	const removeTab = useRemoveTab();
	const splitTabVertical = useSplitTabVertical();
	const splitTabHorizontal = useSplitTabHorizontal();

	const workspaceTabs = useMemo(() => {
		if (!activeWorkspaceId) return [];
		return tabs.filter(
			(t) => t.workspaceId === activeWorkspaceId && !t.parentId,
		);
	}, [tabs, activeWorkspaceId]);

	const activeTabId = activeWorkspaceId
		? activeTabIds[activeWorkspaceId]
		: null;

	useEffect(() => {
		const workspaceHandlers = {
			switchToPrevWorkspace: () => {
				if (!activeWorkspaceId) return;
				const index = findWorkspaceIndex(workspaces, activeWorkspaceId);
				if (index > 0) {
					setActiveWorkspace(workspaces[index - 1].id);
				}
			},
			switchToNextWorkspace: () => {
				if (!activeWorkspaceId) return;
				const index = findWorkspaceIndex(workspaces, activeWorkspaceId);
				if (index < workspaces.length - 1) {
					setActiveWorkspace(workspaces[index + 1].id);
				}
			},
			toggleSidebar,
			splitVertical: () => {
				if (activeWorkspaceId) {
					splitTabVertical(activeWorkspaceId);
				}
			},
			splitHorizontal: () => {
				if (activeWorkspaceId) {
					splitTabHorizontal(activeWorkspaceId);
				}
			},
		};

		const tabHandlers = {
			switchToPrevTab: () => {
				if (!activeWorkspaceId || !activeTabId) return;
				const index = findTabIndex(workspaceTabs, activeTabId);
				if (index > 0) {
					setActiveTab(activeWorkspaceId, workspaceTabs[index - 1].id);
				}
			},
			switchToNextTab: () => {
				if (!activeWorkspaceId || !activeTabId) return;
				const index = findTabIndex(workspaceTabs, activeTabId);
				if (index < workspaceTabs.length - 1) {
					setActiveTab(activeWorkspaceId, workspaceTabs[index + 1].id);
				}
			},
			newTab: () => {
				if (activeWorkspaceId) {
					addTab(activeWorkspaceId);
				}
			},
			closeTab: () => {
				if (activeTabId) {
					removeTab(activeTabId);
				}
			},
			reopenClosedTab: () => {
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

		const splitPaneHandlers = {
			focusPaneLeft: () => console.log("Focus pane left"),
			focusPaneRight: () => console.log("Focus pane right"),
			focusPaneUp: () => console.log("Focus pane up"),
			focusPaneDown: () => console.log("Focus pane down"),
		};

		const workspaceShortcuts = createWorkspaceShortcuts(workspaceHandlers);
		const tabShortcuts = createTabShortcuts(tabHandlers);
		const splitPaneShortcuts = createSplitPaneShortcuts(splitPaneHandlers);

		const allShortcuts = [
			...workspaceShortcuts.shortcuts,
			...tabShortcuts.shortcuts,
			...splitPaneShortcuts.shortcuts,
		];

		const handleKeyDown = createShortcutHandler(allShortcuts);
		window.addEventListener("keydown", handleKeyDown);

		return () => {
			window.removeEventListener("keydown", handleKeyDown);
		};
	}, [
		workspaces,
		activeWorkspaceId,
		workspaceTabs,
		activeTabId,
		setActiveWorkspace,
		toggleSidebar,
		setActiveTab,
		addTab,
		removeTab,
		splitTabVertical,
		splitTabHorizontal,
	]);
}
