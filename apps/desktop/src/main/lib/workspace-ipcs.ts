import { BrowserWindow, dialog, ipcMain, shell } from "electron";

import type {
	CreateTabInput,
	CreateWorkspaceInput,
	CreateWorktreeInput,
	MosaicNode,
	UpdatePreviewTabInput,
	UpdateWorkspaceInput,
} from "shared/types";

import configManager from "./config-manager";
import workspaceManager from "./workspace-manager";
import worktreeManager from "./worktree-manager";
import windowManager from "./window-manager";

export function registerWorkspaceIPCs() {
	// Open repository dialog
	ipcMain.on("open-repository", async (event) => {
		const mainWindow = BrowserWindow.fromWebContents(event.sender);
		if (!mainWindow) return;

		// Show directory picker
		const result = await dialog.showOpenDialog(mainWindow, {
			properties: ["openDirectory"],
			title: "Select Repository",
		});

		if (result.canceled || result.filePaths.length === 0) {
			return;
		}

		const repoPath = result.filePaths[0];

		// Get current branch
		const worktreeManager = (await import("./worktree-manager")).default;
		if (!worktreeManager.isGitRepo(repoPath)) {
			dialog.showErrorBox(
				"Not a Git Repository",
				"The selected directory is not a git repository.",
			);
			return;
		}

		const currentBranch = worktreeManager.getCurrentBranch(repoPath);
		if (!currentBranch) {
			dialog.showErrorBox("Error", "Could not determine current branch.");
			return;
		}

		// Check if workspace already exists for this repo
		const existingWorkspaces = await workspaceManager.list();
		const existingWorkspace = existingWorkspaces.find(
			(ws) => ws.repoPath === repoPath,
		);

		if (existingWorkspace) {
			// Workspace already exists, just switch to it
			mainWindow.webContents.send("workspace-opened", existingWorkspace);
			return;
		}

		// Create workspace with repo name and current branch
		const repoName = repoPath.split("/").pop() || "Repository";

		const createResult = await workspaceManager.create({
			name: repoName,
			repoPath,
			branch: currentBranch,
		});

		if (!createResult.success) {
			dialog.showErrorBox(
				"Error",
				createResult.error || "Failed to open repository",
			);
			return;
		}

		// Notify renderer to reload workspaces
		mainWindow.webContents.send("workspace-opened", createResult.workspace);
	});

	// List all workspaces
	ipcMain.handle("workspace-list", async () => {
		return await workspaceManager.list();
	});

	// Get workspace by ID
	ipcMain.handle("workspace-get", async (_event, id: string) => {
		return await workspaceManager.get(id);
	});

	// Create workspace
	ipcMain.handle(
		"workspace-create",
		async (_event, input: CreateWorkspaceInput) => {
			return await workspaceManager.create(input);
		},
	);

	// Update workspace
	ipcMain.handle(
		"workspace-update",
		async (_event, input: UpdateWorkspaceInput) => {
			return await workspaceManager.update(input);
		},
	);

	// Delete workspace
	ipcMain.handle(
		"workspace-delete",
		async (_event, input: { id: string; removeWorktree?: boolean }) => {
			return await workspaceManager.delete(
				input.id,
				input.removeWorktree ?? false,
			);
		},
	);

	// Get last opened workspace
	ipcMain.handle("workspace-get-last-opened", async () => {
		return await workspaceManager.getLastOpened();
	});

	// Create worktree
	ipcMain.handle(
		"worktree-create",
		async (event, input: CreateWorktreeInput) => {
			// Pass webContents to send progress events
			return await workspaceManager.createWorktree(input, event.sender);
		},
	);

	// Create tab
	ipcMain.handle("tab-create", async (_event, input: CreateTabInput) => {
		return await workspaceManager.createTab(input);
	});

	// Update preview tab
	ipcMain.handle(
		"tab-update-preview",
		async (_event, input: UpdatePreviewTabInput) => {
			return await workspaceManager.updatePreviewTab(input);
		},
	);

	// Delete tab
	ipcMain.handle(
		"tab-delete",
		async (
			_event,
			input: { workspaceId: string; worktreeId: string; tabId: string },
		) => {
			return await workspaceManager.deleteTab(input);
		},
	);

	// Scan and import existing worktrees
	ipcMain.handle(
		"workspace-scan-worktrees",
		async (_event, workspaceId: string) => {
			return await workspaceManager.scanAndImportWorktrees(workspaceId);
		},
	);

	// Get active selection
	ipcMain.handle(
		"workspace-get-active-selection",
		async (_event, workspaceId: string) => {
			return configManager.getActiveSelection(workspaceId);
		},
	);

	// Set active selection
	ipcMain.handle(
		"workspace-set-active-selection",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string | null;
				tabId: string | null;
			},
		) => {
			return await workspaceManager.setActiveSelection(
				input.workspaceId,
				input.worktreeId,
				input.tabId,
			);
		},
	);

	// Get active workspace ID
	ipcMain.handle("workspace-get-active-workspace-id", async () => {
		return await workspaceManager.getActiveWorkspaceId();
	});

	// Set active workspace ID
	ipcMain.handle(
		"workspace-set-active-workspace-id",
		async (_event, workspaceId: string) => {
			return await workspaceManager.setActiveWorkspaceId(workspaceId);
		},
	);

	// Get workspace ID for the current window
	ipcMain.handle("workspace-get-window-workspace-id", async (event) => {
		const senderWindow = BrowserWindow.fromWebContents(event.sender);
		if (!senderWindow) {
			return null;
		}
		return windowManager.getWorkspaceForWindow(senderWindow);
	});

	// Set workspace ID for the current window
	ipcMain.handle(
		"workspace-set-window-workspace-id",
		async (event, workspaceId: string | null) => {
			const senderWindow = BrowserWindow.fromWebContents(event.sender);
			if (!senderWindow) {
				return false;
			}
			windowManager.setWorkspaceForWindow(senderWindow, workspaceId);
			// Also update global active workspace for backward compatibility
			if (workspaceId) {
				await workspaceManager.setActiveWorkspaceId(workspaceId);
			}
			return true;
		},
	);

	// List branches for a workspace
	ipcMain.handle(
		"workspace-list-branches",
		async (_event, workspaceId: string) => {
			const workspace = await workspaceManager.get(workspaceId);
			if (!workspace) {
				return { branches: [], currentBranch: null };
			}

			const worktreeManager = (await import("./worktree-manager")).default;
			const branches = worktreeManager.listBranches(workspace.repoPath);
			const currentBranch = worktreeManager.getCurrentBranch(
				workspace.repoPath,
			);

			return { branches, currentBranch };
		},
	);

	// Reorder tabs within a parent tab or at worktree level
	ipcMain.handle(
		"tab-reorder",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				parentTabId?: string;
				tabIds: string[];
			},
		) => {
			return await workspaceManager.reorderTabs(
				input.workspaceId,
				input.worktreeId,
				input.parentTabId,
				input.tabIds,
			);
		},
	);

	// Move tab between parents
	ipcMain.handle(
		"tab-move",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				tabId: string;
				sourceParentTabId?: string;
				targetParentTabId?: string;
				targetIndex: number;
			},
		) => {
			return await workspaceManager.moveTab(
				input.workspaceId,
				input.worktreeId,
				input.tabId,
				input.sourceParentTabId,
				input.targetParentTabId,
				input.targetIndex,
			);
		},
	);

	// Update mosaic tree for a group tab
	ipcMain.handle(
		"tab-update-mosaic-tree",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				tabId: string;
				mosaicTree: MosaicNode<string> | null | undefined;
			},
		) => {
			return await workspaceManager.updateTabMosaicTree(
				input.workspaceId,
				input.worktreeId,
				input.tabId,
				input.mosaicTree,
			);
		},
	);

	// Update tab name
	ipcMain.handle(
		"tab-update-name",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				tabId: string;
				name: string;
			},
		) => {
			return await workspaceManager.updateTabName(
				input.workspaceId,
				input.worktreeId,
				input.tabId,
				input.name,
			);
		},
	);

	// Update terminal CWD in workspace config
	ipcMain.handle(
		"workspace-update-terminal-cwd",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				tabId: string;
				cwd: string;
			},
		) => {
			return workspaceManager.updateTerminalCwd(
				input.workspaceId,
				input.worktreeId,
				input.tabId,
				input.cwd,
			);
		},
	);

	// Remove worktree
	ipcMain.handle(
		"worktree-remove",
		async (_event, input: { workspaceId: string; worktreeId: string }) => {
			return await workspaceManager.removeWorktree(
				input.workspaceId,
				input.worktreeId,
			);
		},
	);

	// Check if worktree can be removed
	ipcMain.handle(
		"worktree-can-remove",
		async (_event, input: { workspaceId: string; worktreeId: string }) => {
			return await workspaceManager.canRemoveWorktree(
				input.workspaceId,
				input.worktreeId,
			);
		},
	);

	// Check if worktree can be merged
	ipcMain.handle(
		"worktree-can-merge",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				targetWorktreeId?: string;
			},
		) => {
			return await workspaceManager.canMergeWorktree(
				input.workspaceId,
				input.worktreeId,
				input.targetWorktreeId,
			);
		},
	);

	// Merge worktree
	ipcMain.handle(
		"worktree-merge",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				targetWorktreeId?: string;
			},
		) => {
			return await workspaceManager.mergeWorktree(
				input.workspaceId,
				input.worktreeId,
				input.targetWorktreeId,
			);
		},
	);

	// Get worktree path
	ipcMain.handle(
		"worktree-get-path",
		async (_event, input: { workspaceId: string; worktreeId: string }) => {
			return await workspaceManager.getWorktreePath(
				input.workspaceId,
				input.worktreeId,
			);
		},
	);

	// Check worktree settings folder
	ipcMain.handle(
		"worktree-check-settings",
		async (_event, input: { workspaceId: string; worktreeId: string }) => {
			return await workspaceManager.checkWorktreeSettings(
				input.workspaceId,
				input.worktreeId,
			);
		},
	);

	// Open worktree settings folder
	ipcMain.handle(
		"worktree-open-settings",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				createIfMissing?: boolean;
			},
		) => {
			return await workspaceManager.openWorktreeSettings(
				input.workspaceId,
				input.worktreeId,
				input.createIfMissing,
			);
		},
	);

	// Get git status for a worktree
	ipcMain.handle(
		"worktree-get-git-status",
		async (_event, input: { workspaceId: string; worktreeId: string }) => {
			try {
				const workspace = await workspaceManager.getWorkspace(
					input.workspaceId,
				);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				const worktree = workspace.worktrees.find(
					(wt) => wt.id === input.worktreeId,
				);
				if (!worktree) {
					return {
						success: false,
						error: "Worktree not found",
					};
				}

				return await worktreeManager.getGitStatus(
					worktree.path,
					workspace.branch,
				);
			} catch (error) {
				console.error("Failed to get git status:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Update worktree description
	ipcMain.handle(
		"worktree-update-description",
		async (
			_event,
			input: { workspaceId: string; worktreeId: string; description: string },
		) => {
			return await workspaceManager.updateWorktreeDescription(
				input.workspaceId,
				input.worktreeId,
				input.description,
			);
		},
	);

	// Get git diff for a worktree
	ipcMain.handle(
		"worktree-get-git-diff",
		async (_event, input: { workspaceId: string; worktreeId: string }) => {
			try {
				const workspace = await workspaceManager.getWorkspace(
					input.workspaceId,
				);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				const worktree = workspace.worktrees.find(
					(wt) => wt.id === input.worktreeId,
				);
				if (!worktree) {
					return {
						success: false,
						error: "Worktree not found",
					};
				}

				return await worktreeManager.getGitDiff(
					worktree.path,
					workspace.branch,
				);
			} catch (error) {
				console.error("Failed to get git diff:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Get git diff file list (without full content) - non-blocking
	ipcMain.handle(
		"worktree-get-git-diff-file-list",
		async (_event, input: { workspaceId: string; worktreeId: string }) => {
			try {
				const workspace = await workspaceManager.getWorkspace(
					input.workspaceId,
				);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				const worktree = workspace.worktrees.find(
					(wt) => wt.id === input.worktreeId,
				);
				if (!worktree) {
					return {
						success: false,
						error: "Worktree not found",
					};
				}

				return await worktreeManager.getGitDiffFileList(
					worktree.path,
					workspace.branch,
				);
			} catch (error) {
				console.error("Failed to get git diff file list:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Get git diff for a single file - lazy loading
	ipcMain.handle(
		"worktree-get-git-diff-file",
		async (
			_event,
			input: {
				workspaceId: string;
				worktreeId: string;
				filePath: string;
				oldPath?: string;
				status: "added" | "deleted" | "modified" | "renamed";
			},
		) => {
			try {
				const workspace = await workspaceManager.getWorkspace(
					input.workspaceId,
				);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				const worktree = workspace.worktrees.find(
					(wt) => wt.id === input.worktreeId,
				);
				if (!worktree) {
					return {
						success: false,
						error: "Worktree not found",
					};
				}

				// Detect main branch instead of using workspace.branch
				// This ensures we compare against main/master, not a feature branch
				const mainBranch = await worktreeManager.detectMainBranch(workspace.repoPath);

				return await worktreeManager.getGitDiffFile(
					worktree.path,
					mainBranch,
					input.filePath,
					input.oldPath,
					input.status,
				);
			} catch (error) {
				console.error("Failed to get git diff file:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Create PR for a worktree
	ipcMain.handle(
		"worktree-create-pr",
		async (_event, input: { workspaceId: string; worktreeId: string }) => {
			try {
				const workspace = await workspaceManager.getWorkspace(
					input.workspaceId,
				);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				const worktree = workspace.worktrees.find(
					(wt) => wt.id === input.worktreeId,
				);
				if (!worktree) {
					return {
						success: false,
						error: "Worktree not found",
					};
				}

				const result = await worktreeManager.createPullRequest(
					worktree.path,
					worktree.branch,
					workspace.branch,
				);

				// If successful, store the PR URL in the worktree config
				if (result.success && result.prUrl) {
					console.log(
						`Storing PR URL for worktree ${worktree.id}: ${result.prUrl}`,
					);
					worktree.prUrl = result.prUrl;
					await workspaceManager.saveConfig();
				} else {
					console.log(
						`PR created but no URL returned. Success: ${result.success}, URL: ${result.prUrl}`,
					);
				}

				return result;
			} catch (error) {
				console.error("Failed to create PR:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Merge PR for a worktree
	ipcMain.handle(
		"worktree-merge-pr",
		async (_event, input: { workspaceId: string; worktreeId: string }) => {
			try {
				const workspace = await workspaceManager.getWorkspace(
					input.workspaceId,
				);
				if (!workspace) {
					return {
						success: false,
						error: "Workspace not found",
					};
				}

				const worktree = workspace.worktrees.find(
					(wt) => wt.id === input.worktreeId,
				);
				if (!worktree) {
					return {
						success: false,
						error: "Worktree not found",
					};
				}

				if (!worktree.prUrl) {
					return {
						success: false,
						error: "No PR found for this worktree",
					};
				}

				const result = await worktreeManager.mergePullRequest(
					worktree.path,
					worktree.prUrl,
				);

				// If successful, clear the PR URL and mark as merged
				if (result.success) {
					worktree.prUrl = undefined;
					worktree.merged = true;
					await workspaceManager.saveConfig();
				}

				return result;
			} catch (error) {
				console.error("Failed to merge PR:", error);
				return {
					success: false,
					error: error instanceof Error ? error.message : String(error),
				};
			}
		},
	);

	// Open app settings in Cursor
	ipcMain.handle("open-app-settings", async () => {
		try {
			const configPath = configManager.getConfigPath();
			// Open in Cursor using cursor://file protocol
			await shell.openExternal(`cursor://file/${configPath}`);
			return { success: true };
		} catch (error) {
			console.error("Failed to open app settings:", error);
			return {
				success: false,
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});
}
