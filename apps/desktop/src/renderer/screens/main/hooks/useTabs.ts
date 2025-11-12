import type { Tab, Workspace } from "shared/types";
import { findTabRecursive } from "../utils";

interface UseTabsProps {
	currentWorkspace: Workspace | null;
	setCurrentWorkspace: (workspace: Workspace) => void;
	selectedWorktreeId: string | null;
	setSelectedWorktreeId: (id: string | null) => void;
	selectedTabId: string | null;
	setSelectedTabId: (id: string | null) => void;
}

export function useTabs({
	currentWorkspace,
	setCurrentWorkspace,
	selectedWorktreeId,
	setSelectedWorktreeId,
	selectedTabId,
	setSelectedTabId,
}: UseTabsProps) {

	// Get selected worktree
	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
	);

	// Get selected tab and its parent (if it's a sub-tab)
	const tabResult = selectedWorktree?.tabs
		? findTabRecursive(selectedWorktree.tabs, selectedTabId ?? "")
		: null;

	const selectedTab = tabResult?.tab;
	const parentGroupTab = tabResult?.parent;

	// Optimistically add a tab to the current workspace
	const handleTabCreated = (worktreeId: string, tab: Tab) => {
		if (!currentWorkspace) return;

		// Find the worktree and add the tab
		const updatedWorktrees = currentWorkspace.worktrees.map((wt) => {
			if (wt.id === worktreeId) {
				return {
					...wt,
					tabs: [...wt.tabs, tab],
				};
			}
			return wt;
		});

		const updatedWorkspace = {
			...currentWorkspace,
			worktrees: updatedWorktrees,
			activeWorktreeId: worktreeId,
			activeTabId: tab.id,
		};

		setCurrentWorkspace(updatedWorkspace);
	};

	// Handle tab selection
	const handleTabSelect = (worktreeId: string, tabId: string) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabId(tabId);

		if (currentWorkspace) {
			window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId,
				tabId,
			});

			setCurrentWorkspace({
				...currentWorkspace,
				activeWorktreeId: worktreeId,
				activeTabId: tabId,
			});
		}
	};

	// Handle tab focus (for terminals)
	const handleTabFocus = (tabId: string) => {
		if (!currentWorkspace || !selectedWorktreeId) return;

		setSelectedTabId(tabId);

		window.ipcRenderer.invoke("workspace-set-active-selection", {
			workspaceId: currentWorkspace.id,
			worktreeId: selectedWorktreeId,
			tabId,
		});

		setCurrentWorkspace({
			...currentWorkspace,
			activeWorktreeId: selectedWorktreeId,
			activeTabId: tabId,
		});
	};

	return {
		selectedWorktreeId,
		setSelectedWorktreeId,
		selectedTabId,
		setSelectedTabId,
		selectedWorktree,
		selectedTab,
		parentGroupTab,
		handleTabCreated,
		handleTabSelect,
		handleTabFocus,
	};
}

