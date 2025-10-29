import { useEffect, useState } from "react";

import { useConfigStore, storeHydrated } from "renderer/stores/config-store";
import { useWorkspaceStore } from "renderer/stores/workspace-store";
import ScreenLayout from "renderer/components/ScreenLayout";
import type { Workspace } from "shared/runtime-types";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

export function MainScreen() {
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);

	// Config store - workspace refs + templates (auto-synced to main process)
	const { workspaces, setLastWorkspace, addWorkspace } = useConfigStore();

	// Workspace store - runtime state (NOT persisted)
	const {
		currentWorkspace,
		activeWorktreeId,
		activeTabGroupId,
		activeTabId,
		setCurrentWorkspace,
		setActiveSelection,
		getActiveWorktree,
		getActiveTabGroup,
	} = useWorkspaceStore();

	// Derived state from getters
	const selectedWorktree = getActiveWorktree();
	const selectedTabGroup = getActiveTabGroup();

	// Load config from main process on mount
	useEffect(() => {
		const loadConfig = async () => {
			try {
				// Wait for store to hydrate from main process
				await storeHydrated;

				// Get the loaded config to check for lastWorkspaceId
				const { lastWorkspaceId } = useConfigStore.getState();

				// If there's a last workspace, load it with live git data
				if (lastWorkspaceId) {
					const workspace = (await window.ipcRenderer.invoke(
						"workspace-get",
						lastWorkspaceId,
					)) as Workspace | null;
					if (workspace) {
						setCurrentWorkspace(workspace);
					}
				}
			} catch (err) {
				console.error("[MainScreen] Failed to load config:", err);
			}
		};

		loadConfig();
	}, [setCurrentWorkspace]);

	// Listen for workspace-opened event from File menu
	useEffect(() => {
		const handler = async (workspace: Workspace) => {
			console.log("[MainScreen] Workspace opened event received:", workspace);

			// Add workspace ref to config if it doesn't exist
			const existing = workspaces.find((w) => w.id === workspace.id);
			if (!existing) {
				addWorkspace({
					id: workspace.id,
					name: workspace.name,
					repoPath: workspace.repoPath,
				});
				// Note: addWorkspace auto-syncs to main process
			}

			// Set as current in both stores (auto-syncs to main)
			setLastWorkspace(workspace.id);
			setCurrentWorkspace(workspace);
		};

		window.ipcRenderer.on("workspace-opened", handler);
		return () => {
			window.ipcRenderer.off("workspace-opened", handler);
		};
	}, [workspaces, addWorkspace, setLastWorkspace, setCurrentWorkspace]);

	const handleTabSelect = (
		worktreeId: string,
		tabGroupId: string,
		tabId: string,
	) => {
		setActiveSelection(worktreeId, tabGroupId, tabId);
	};

	const handleTabGroupSelect = (worktreeId: string, tabGroupId: string) => {
		setActiveSelection(worktreeId, tabGroupId, null);
	};

	const handleTabFocus = (tabId: string) => {
		if (!selectedWorktree || !selectedTabGroup) return;

		setActiveSelection(selectedWorktree.id, selectedTabGroup.id, tabId);
	};

	const handleWorkspaceSelect = async (workspaceId: string) => {
		// Fetch workspace with live git data
		try {
			const workspace = (await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			)) as Workspace | null;

			if (workspace) {
				// Auto-syncs to main process
				setLastWorkspace(workspaceId);
				setCurrentWorkspace(workspace);
				// Reset selections when switching workspaces
				setActiveSelection(null, null, null);
			}
		} catch (err) {
			console.error("[MainScreen] Failed to get workspace:", err);
		}
	};

	const handleWorktreeCreated = async () => {
		if (!currentWorkspace) return;

		// Refresh workspace data from main process after worktree creation
		try {
			const refreshed = (await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			)) as Workspace | null;
			if (refreshed) {
				setCurrentWorkspace(refreshed);
			}
		} catch (err) {
			console.error("[MainScreen] Failed to refresh workspace:", err);
		}
	};

	const handleScanWorktrees = async () => {
		if (!currentWorkspace) return { success: false };

		try {
			const result = (await window.ipcRenderer.invoke(
				"workspace-scan-worktrees",
				currentWorkspace.id,
			)) as { success: boolean; workspace?: Workspace; imported?: number; error?: string };

			if (result.success && result.workspace) {
				// Update workspace with scanned worktrees
				setCurrentWorkspace(result.workspace);
			}

			return {
				success: result.success,
				imported: result.imported,
			};
		} catch (err) {
			console.error("[MainScreen] Failed to scan worktrees:", err);
			return { success: false };
		}
	};

	const handleCreateWorktree = async (
		branch: string,
		createBranch: boolean,
	) => {
		if (!currentWorkspace) {
			return { success: false, error: "No workspace selected" };
		}

		try {
			const result = (await window.ipcRenderer.invoke("worktree-create", {
				workspaceId: currentWorkspace.id,
				branch,
				createBranch,
			})) as { success: boolean; error?: string };

			if (result.success) {
				// Refresh workspace data after successful creation
				const refreshed = (await window.ipcRenderer.invoke(
					"workspace-get",
					currentWorkspace.id,
				)) as Workspace | null;
				if (refreshed) {
					setCurrentWorkspace(refreshed);
				}
			}

			return result;
		} catch (err) {
			const errorMessage = err instanceof Error ? err.message : String(err);
			console.error("[MainScreen] Failed to create worktree:", err);
			return { success: false, error: errorMessage };
		}
	};

	const handleUpdateWorktree = async () => {
		if (!currentWorkspace) return;

		// Refresh workspace data from disk to get latest state
		try {
			const refreshed = (await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			)) as Workspace | null;
			if (refreshed) {
				setCurrentWorkspace(refreshed);
			}
		} catch (err) {
			console.error("[MainScreen] Failed to refresh workspace:", err);
		}
	};

	return (
		<div className="flex h-screen relative text-neutral-300">
			<Background />

			{/* App Frame - continuous border + sidebar + topbar */}
			<AppFrame>
				{isSidebarOpen && workspaces.length > 0 && (
					<Sidebar
						workspaces={workspaces}
						currentWorkspace={currentWorkspace}
						onTabSelect={handleTabSelect}
						onTabGroupSelect={handleTabGroupSelect}
						onWorktreeCreated={handleWorktreeCreated}
						onWorkspaceSelect={handleWorkspaceSelect}
						onUpdateWorktree={handleUpdateWorktree}
						onScanWorktrees={handleScanWorktrees}
						onCreateWorktree={handleCreateWorktree}
						selectedTabId={activeTabId ?? undefined}
						selectedTabGroupId={activeTabGroupId ?? undefined}
						onCollapse={() => setIsSidebarOpen(false)}
					/>
				)}

				{/* Main Content Area */}
				<div className="flex-1 flex flex-col overflow-hidden">
					{/* Top Bar */}
					<TopBar
						isSidebarOpen={isSidebarOpen}
						onOpenSidebar={() => setIsSidebarOpen(true)}
						workspaceName={currentWorkspace?.name}
						currentBranch={currentWorkspace?.branch}
					/>

					{/* Content Area - Terminal Layout */}
					<div className="flex-1 overflow-hidden">
						{!currentWorkspace && (
							<div className="flex flex-col items-center justify-center h-full text-neutral-400 bg-neutral-950/40 backdrop-blur-xl rounded-2xl">
								<p className="mb-4">No repository open</p>
								<p className="text-sm text-neutral-500">
									Use{" "}
									<span className="font-mono">File → Open Repository...</span>{" "}
									or <span className="font-mono">Cmd+O</span> to get started
								</p>
							</div>
						)}

						{currentWorkspace && !selectedTabGroup && (
							<div className="flex flex-col items-center justify-center h-full text-neutral-400 bg-neutral-950/40 backdrop-blur-xl rounded-2xl">
								<p className="mb-4">
									Select a worktree and tab to view terminals
								</p>
								<p className="text-sm text-neutral-500">
									Create a worktree from the sidebar to get started
								</p>
							</div>
						)}

						{selectedTabGroup && selectedWorktree && currentWorkspace && (
							<ScreenLayout
								tabGroup={selectedTabGroup}
								workingDirectory={
									selectedWorktree.path || currentWorkspace.repoPath
								}
								workspaceId={currentWorkspace.id}
								worktreeId={selectedWorktree.id}
								selectedTabId={activeTabId ?? undefined}
								onTabFocus={handleTabFocus}
							/>
						)}
					</div>
				</div>
			</AppFrame>
		</div>
	);
}
