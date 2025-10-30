import { useEffect, useState } from "react";
import type { Tab, Workspace } from "shared/types";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import TabContent from "./components/MainContent/TabContent";
import TabGroup from "./components/MainContent/TabGroup";
import { PlaceholderState } from "./components/PlaceholderState";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

export function MainScreen() {
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [workspaces, setWorkspaces] = useState<Workspace[] | null>(null);
	const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
		null,
	);
	const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(
		null,
	);
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null); // Can be a group tab or any tab
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
	);

	// Helper function to find a tab recursively (for finding sub-tabs inside groups)
	const findTabRecursive = (
		tabs: Tab[] | undefined,
		tabId: string,
	): { tab: Tab; parent?: Tab } | null => {
		if (!tabs) return null;

		for (const tab of tabs) {
			if (tab.id === tabId) {
				return { tab };
			}
			// Check if this tab is a group tab with children
			if (tab.type === "group" && tab.tabs) {
				for (const childTab of tab.tabs) {
					if (childTab.id === tabId) {
						return { tab: childTab, parent: tab };
					}
				}
			}
		}
		return null;
	};

	// Get selected tab and its parent (if it's a sub-tab)
	const tabResult = selectedWorktree?.tabs
		? findTabRecursive(selectedWorktree.tabs, selectedTabId ?? "")
		: null;

	const selectedTab = tabResult?.tab;
	const parentGroupTab = tabResult?.parent;

	const handleTabSelect = (worktreeId: string, tabId: string) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabId(tabId);
		// Save active selection
		if (currentWorkspace) {
			window.ipcRenderer.invoke("workspace-set-active-selection", {
				workspaceId: currentWorkspace.id,
				worktreeId,
				tabId,
			});
		}
	};

	const handleTabFocus = (tabId: string) => {
		// When a terminal gets focus, update the selected tab
		if (!currentWorkspace || !selectedWorktreeId) return;

		setSelectedTabId(tabId);
		// Save active selection
		window.ipcRenderer.invoke("workspace-set-active-selection", {
			workspaceId: currentWorkspace.id,
			worktreeId: selectedWorktreeId,
			tabId,
		});
	};

	const handleWorkspaceSelect = async (workspaceId: string) => {
		try {
			const workspace = await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			);

			if (workspace) {
				setCurrentWorkspace(workspace);
				// Persist the active workspace
				await window.ipcRenderer.invoke(
					"workspace-set-active-workspace-id",
					workspaceId,
				);
				// Restore the active selection for this workspace
				const activeSelection = await window.ipcRenderer.invoke(
					"workspace-get-active-selection",
					workspaceId,
				);

				if (activeSelection?.worktreeId && activeSelection?.tabId) {
					setSelectedWorktreeId(activeSelection.worktreeId);
					setSelectedTabId(activeSelection.tabId);
				} else {
					// No saved selection, reset
					setSelectedWorktreeId(null);
					setSelectedTabId(null);
				}
			}
		} catch (error) {
			console.error("Failed to load workspace:", error);
		}
	};

	const handleWorktreeCreated = async () => {
		// Refresh workspace data after worktree creation
		if (!currentWorkspace) return;

		try {
			const refreshedWorkspace = await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			);

			if (refreshedWorkspace) {
				setCurrentWorkspace(refreshedWorkspace);
				// Also refresh workspaces list
				await loadAllWorkspaces();
			}
		} catch (error) {
			console.error("Failed to refresh workspace:", error);
		}
	};

	const handleUpdateWorktree = (worktreeId: string, updatedWorktree: any) => {
		// Optimistically update the worktree in the current workspace
		if (!currentWorkspace) return;

		const updatedWorktrees = currentWorkspace.worktrees.map((wt) =>
			wt.id === worktreeId ? updatedWorktree : wt,
		);

		const updatedCurrentWorkspace = {
			...currentWorkspace,
			worktrees: updatedWorktrees,
		};

		setCurrentWorkspace(updatedCurrentWorkspace);

		// Also update the workspaces array so the carousel renders the updated data
		if (workspaces) {
			setWorkspaces(
				workspaces.map((ws) =>
					ws.id === currentWorkspace.id ? updatedCurrentWorkspace : ws,
				),
			);
		}
	};

	const loadAllWorkspaces = async () => {
		try {
			const allWorkspaces = await window.ipcRenderer.invoke("workspace-list");

			setWorkspaces(allWorkspaces);
		} catch (error) {
			console.error("Failed to load workspaces:", error);
		}
	};

	// Scan for existing worktrees when workspace is opened
	const scanWorktrees = async (workspaceId: string) => {
		try {
			const result = await window.ipcRenderer.invoke(
				"workspace-scan-worktrees",
				workspaceId,
			);

			if (result.success && result.imported && result.imported > 0) {
				console.log("[MainScreen] Imported worktrees:", result.imported);
				// Refresh workspace data
				const refreshedWorkspace = await window.ipcRenderer.invoke(
					"workspace-get",
					workspaceId,
				);

				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}
			}
		} catch (error) {
			console.error("[MainScreen] Failed to scan worktrees:", error);
		}
	};

	// Load active workspace and all workspaces on mount
	useEffect(() => {
		const loadActiveWorkspace = async () => {
			try {
				setLoading(true);
				setError(null);

				// Load all workspaces
				await loadAllWorkspaces();

				// Try to load the active workspace first, fall back to last opened
				let workspaceId = await window.ipcRenderer.invoke(
					"workspace-get-active-workspace-id",
				);

				// Fall back to last opened if no active workspace
				if (!workspaceId) {
					const lastOpenedWorkspace = await window.ipcRenderer.invoke(
						"workspace-get-last-opened",
					);
					workspaceId = lastOpenedWorkspace?.id ?? null;
				}

				if (workspaceId) {
					const workspace = await window.ipcRenderer.invoke(
						"workspace-get",
						workspaceId,
					);

					if (workspace) {
						setCurrentWorkspace(workspace);
						// Scan for existing worktrees
						await scanWorktrees(workspace.id);

						// Restore active selection for this workspace
						const activeSelection = await window.ipcRenderer.invoke(
							"workspace-get-active-selection",
							workspaceId,
						);

						if (activeSelection?.worktreeId && activeSelection?.tabId) {
							setSelectedWorktreeId(activeSelection.worktreeId);
							setSelectedTabId(activeSelection.tabId);
						}
					}
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setLoading(false);
			}
		};

		loadActiveWorkspace();
	}, []);

	// Listen for workspace-opened event from menu
	useEffect(() => {
		const handler = async (workspace: Workspace) => {
			console.log("[MainScreen] Workspace opened event received:", workspace);
			setCurrentWorkspace(workspace);
			setLoading(false);
			// Persist the active workspace
			await window.ipcRenderer.invoke(
				"workspace-set-active-workspace-id",
				workspace.id,
			);
			// Refresh workspaces list
			await loadAllWorkspaces();
			// Scan for existing worktrees
			await scanWorktrees(workspace.id);
		};

		console.log("[MainScreen] Setting up workspace-opened listener");
		window.ipcRenderer.on("workspace-opened", handler);
		return () => {
			console.log("[MainScreen] Removing workspace-opened listener");
			window.ipcRenderer.off("workspace-opened", handler);
		};
	}, []);

	return (
		<div className="flex h-screen relative text-neutral-300">
			<Background />

			{/* App Frame - continuous border + sidebar + topbar */}
			<AppFrame>
				{isSidebarOpen && workspaces && (
					<Sidebar
						workspaces={workspaces}
						currentWorkspace={currentWorkspace}
						onTabSelect={handleTabSelect}
						onWorktreeCreated={handleWorktreeCreated}
						onWorkspaceSelect={handleWorkspaceSelect}
						onUpdateWorktree={handleUpdateWorktree}
						selectedTabId={selectedTabId ?? undefined}
						onCollapse={() => setIsSidebarOpen(false)}
					/>
				)}

				{/* Main Content Area */}
				<div className="flex-1 flex flex-col overflow-hidden">
					{/* Top Bar */}
					{/* <TopBar
						isSidebarOpen={isSidebarOpen}
						onOpenSidebar={() => setIsSidebarOpen(true)}
						workspaceName={currentWorkspace?.name}
						currentBranch={currentWorkspace?.branch}
					/> */}

					{/* Content Area */}
					<div className="flex-1 overflow-hidden m-1 rounded-lg">
						{loading ||
						error ||
						!currentWorkspace ||
						!selectedTab ||
						!selectedWorktree ? (
							<PlaceholderState
								loading={loading}
								error={error}
								hasWorkspace={!!currentWorkspace}
							/>
						) : parentGroupTab ? (
							// Selected tab is a sub-tab of a group → display the parent group's mosaic
							<TabGroup
								groupTab={parentGroupTab}
								workingDirectory={
									selectedWorktree.path || currentWorkspace.repoPath
								}
								workspaceId={currentWorkspace.id}
								worktreeId={selectedWorktreeId ?? undefined}
								selectedTabId={selectedTabId ?? undefined}
								onTabFocus={handleTabFocus}
							/>
						) : selectedTab.type === "group" ? (
							// Selected tab is a group tab → display its mosaic layout
							<TabGroup
								groupTab={selectedTab}
								workingDirectory={
									selectedWorktree.path || currentWorkspace.repoPath
								}
								workspaceId={currentWorkspace.id}
								worktreeId={selectedWorktreeId ?? undefined}
								selectedTabId={selectedTabId ?? undefined}
								onTabFocus={handleTabFocus}
							/>
						) : (
							// Base level tab (not inside a group) → display full width/height
							<div className="w-full h-full">
								<TabContent
									tab={selectedTab}
									workingDirectory={
										selectedWorktree.path || currentWorkspace.repoPath
									}
									workspaceId={currentWorkspace.id}
									worktreeId={selectedWorktreeId ?? undefined}
									groupTabId="" // No parent group
									selectedTabId={selectedTabId ?? undefined}
									onTabFocus={handleTabFocus}
								/>
							</div>
						)}
					</div>
				</div>
			</AppFrame>
		</div>
	);
}
