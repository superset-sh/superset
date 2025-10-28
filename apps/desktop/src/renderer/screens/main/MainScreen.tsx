import { useEffect, useState } from "react";

import TerminalLayout from "renderer/components/TerminalLayout";
import type { Workspace } from "shared/types";
import { AppFrame } from "./components/AppFrame";
import { Background } from "./components/Background";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";

export function MainScreen() {
	const [isSidebarOpen, setIsSidebarOpen] = useState(true);
	const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
	const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(
		null,
	);
	const [selectedWorktreeId, setSelectedWorktreeId] = useState<string | null>(
		null,
	);
	const [selectedTabGroupId, setSelectedTabGroupId] = useState<string | null>(
		null,
	);
	const [selectedTabId, setSelectedTabId] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Get selected tab group details (contains all tabs in the grid)
	const selectedTabGroup = currentWorkspace?.worktrees
		?.find((wt) => wt.id === selectedWorktreeId)
		?.tabGroups.find((tg) => tg.id === selectedTabGroupId);

	const selectedWorktree = currentWorkspace?.worktrees?.find(
		(wt) => wt.id === selectedWorktreeId,
	);

	const handleTabSelect = (
		worktreeId: string,
		tabGroupId: string,
		tabId: string,
	) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabGroupId(tabGroupId);
		setSelectedTabId(tabId);
		// Save active selection
		window.ipcRenderer.invoke(
			"workspace-set-active-selection",
			worktreeId,
			tabGroupId,
			tabId,
		);
	};

	const handleTabGroupSelect = (worktreeId: string, tabGroupId: string) => {
		setSelectedWorktreeId(worktreeId);
		setSelectedTabGroupId(tabGroupId);
		// Clear individual tab selection when selecting a tab group
		setSelectedTabId(null);
		// Save active selection
		window.ipcRenderer.invoke(
			"workspace-set-active-selection",
			worktreeId,
			tabGroupId,
			null,
		);
	};

	const handleWorkspaceSelect = async (workspaceId: string) => {
		try {
			const workspace = (await window.ipcRenderer.invoke(
				"workspace-get",
				workspaceId,
			)) as Workspace | null;

			if (workspace) {
				setCurrentWorkspace(workspace);
				// Reset tab selection when switching workspaces
				setSelectedWorktreeId(null);
				setSelectedTabGroupId(null);
				setSelectedTabId(null);
			}
		} catch (error) {
			console.error("Failed to load workspace:", error);
		}
	};

	const handleWorktreeCreated = async () => {
		// Refresh workspace data after worktree creation
		if (!currentWorkspace) return;

		try {
			const refreshedWorkspace = (await window.ipcRenderer.invoke(
				"workspace-get",
				currentWorkspace.id,
			)) as Workspace | null;

			if (refreshedWorkspace) {
				setCurrentWorkspace(refreshedWorkspace);
				// Also refresh workspaces list
				await loadAllWorkspaces();
			}
		} catch (error) {
			console.error("Failed to refresh workspace:", error);
		}
	};

	const loadAllWorkspaces = async () => {
		try {
			const allWorkspaces = (await window.ipcRenderer.invoke(
				"workspace-list",
			)) as Workspace[];

			setWorkspaces(allWorkspaces);
		} catch (error) {
			console.error("Failed to load workspaces:", error);
		}
	};

	// Scan for existing worktrees when workspace is opened
	const scanWorktrees = async (workspaceId: string) => {
		try {
			const result = (await window.ipcRenderer.invoke(
				"workspace-scan-worktrees",
				workspaceId,
			)) as { success: boolean; imported?: number; error?: string };

			if (result.success && result.imported && result.imported > 0) {
				console.log("[MainScreen] Imported worktrees:", result.imported);
				// Refresh workspace data
				const refreshedWorkspace = (await window.ipcRenderer.invoke(
					"workspace-get",
					workspaceId,
				)) as Workspace | null;

				if (refreshedWorkspace) {
					setCurrentWorkspace(refreshedWorkspace);
				}
			}
		} catch (error) {
			console.error("[MainScreen] Failed to scan worktrees:", error);
		}
	};

	// Load last opened workspace and all workspaces on mount
	useEffect(() => {
		const loadLastWorkspace = async () => {
			try {
				setLoading(true);
				setError(null);

				// Load all workspaces
				await loadAllWorkspaces();

				// Load last opened workspace
				const workspace = (await window.ipcRenderer.invoke(
					"workspace-get-last-opened",
				)) as Workspace | null;

				if (workspace) {
					setCurrentWorkspace(workspace);
					// Scan for existing worktrees
					await scanWorktrees(workspace.id);

					// Restore active selection
					const activeSelection = (await window.ipcRenderer.invoke(
						"workspace-get-active-selection",
					)) as {
						worktreeId: string | null;
						tabGroupId: string | null;
						tabId: string | null;
					};

					if (activeSelection.worktreeId && activeSelection.tabGroupId) {
						setSelectedWorktreeId(activeSelection.worktreeId);
						setSelectedTabGroupId(activeSelection.tabGroupId);
						setSelectedTabId(activeSelection.tabId);
					}
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : String(err));
			} finally {
				setLoading(false);
			}
		};

		loadLastWorkspace();
	}, []);

	// Listen for workspace-opened event from menu
	useEffect(() => {
		const handler = async (workspace: Workspace) => {
			console.log("[MainScreen] Workspace opened event received:", workspace);
			setCurrentWorkspace(workspace);
			setLoading(false);
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
				{isSidebarOpen && (
					<Sidebar
						workspaces={workspaces}
						currentWorkspace={currentWorkspace}
						onTabSelect={handleTabSelect}
						onTabGroupSelect={handleTabGroupSelect}
						onWorktreeCreated={handleWorktreeCreated}
						onWorkspaceSelect={handleWorkspaceSelect}
						selectedTabId={selectedTabId ?? undefined}
						selectedTabGroupId={selectedTabGroupId ?? undefined}
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
						{loading && (
							<div className="flex items-center justify-center h-full bg-neutral-950/40 backdrop-blur-xl rounded-2xl">
								Loading workspace...
							</div>
						)}

						{error && (
							<div className="flex items-center justify-center h-full text-red-400 bg-neutral-950/40 backdrop-blur-xl rounded-2xl">
								Error: {error}
							</div>
						)}

						{!loading && !error && !currentWorkspace && (
							<div className="flex flex-col items-center justify-center h-full text-neutral-400 bg-neutral-950/40 backdrop-blur-xl rounded-2xl">
								<p className="mb-4">No repository open</p>
								<p className="text-sm text-neutral-500">
									Use{" "}
									<span className="font-mono">File → Open Repository...</span>{" "}
									or <span className="font-mono">Cmd+O</span> to get started
								</p>
							</div>
						)}

						{!loading && !error && currentWorkspace && !selectedTabGroup && (
							<div className="flex flex-col items-center justify-center h-full text-neutral-400 bg-neutral-950/40 backdrop-blur-xl rounded-2xl">
								<p className="mb-4">Select a worktree and tab to view terminals</p>
								<p className="text-sm text-neutral-500">
									Create a worktree from the sidebar to get started
								</p>
							</div>
						)}

						{!loading &&
							!error &&
							selectedTabGroup &&
							selectedWorktree &&
							currentWorkspace && (
								<TerminalLayout
									tabGroup={selectedTabGroup}
									workingDirectory={
										selectedWorktree.path || currentWorkspace.repoPath
									}
									workspaceId={currentWorkspace.id}
									worktreeId={selectedWorktreeId ?? undefined}
								/>
							)}
					</div>
				</div>
			</AppFrame>
		</div>
	);
}
