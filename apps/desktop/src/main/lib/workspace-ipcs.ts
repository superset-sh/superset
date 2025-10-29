import { BrowserWindow, dialog, ipcMain } from "electron";
import { randomUUID } from "node:crypto";

import type {
	CreateTabGroupInput,
	CreateTabInput,
	CreateWorkspaceInput,
	CreateWorktreeInput,
	UpdateWorkspaceInput,
} from "shared/types";
import { electronStore } from "./config-store";
import worktreeManager from "./worktree-manager";
import type { Workspace, Worktree } from "shared/runtime-types";

export function registerWorkspaceIPCs() {
	// ========================================
	// WORKSPACE OPERATIONS
	// ========================================

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

		// Validate git repo
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
		const existingWorkspaces = electronStore.get("workspaces", []);
		const existingWorkspace = existingWorkspaces.find(
			(ws) => ws.repoPath === repoPath,
		);

		if (existingWorkspace) {
			// Workspace already exists, fetch with live git data
			const workspace = await getWorkspaceWithGitData(existingWorkspace.id);
			mainWindow.webContents.send("workspace-opened", workspace);
			return;
		}

		// Create new workspace reference
		const repoName = repoPath.split("/").pop() || "Repository";
		const workspaceRef = {
			id: randomUUID(),
			name: repoName,
			repoPath,
		};

		// Save to config
		electronStore.set("workspaces", [...existingWorkspaces, workspaceRef]);
		electronStore.set("lastWorkspaceId", workspaceRef.id);

		// Get with live git data
		const workspace = await getWorkspaceWithGitData(workspaceRef.id);
		mainWindow.webContents.send("workspace-opened", workspace);
	});

	// List all workspace references
	ipcMain.handle("workspace-list", async () => {
		return electronStore.get("workspaces", []);
	});

	// Get workspace with live git data
	ipcMain.handle("workspace-get", async (_event, id: string) => {
		return await getWorkspaceWithGitData(id);
	});

	// Create workspace reference
	ipcMain.handle(
		"workspace-create",
		async (_event, input: CreateWorkspaceInput) => {
			if (!worktreeManager.isGitRepo(input.repoPath)) {
				return { success: false, error: "Not a git repository" };
			}

			const workspaceRef = {
				id: randomUUID(),
				name: input.name,
				repoPath: input.repoPath,
			};

			// Save to config
			const workspaces = electronStore.get("workspaces", []);
			electronStore.set("workspaces", [...workspaces, workspaceRef]);
			electronStore.set("lastWorkspaceId", workspaceRef.id);

			// Get with live git data
			const workspace = await getWorkspaceWithGitData(workspaceRef.id);

			return { success: true, workspace };
		},
	);

	// Update workspace reference
	ipcMain.handle(
		"workspace-update",
		async (_event, input: UpdateWorkspaceInput) => {
			const workspaces = electronStore.get("workspaces", []);
			const updated = workspaces.map((w) =>
				w.id === input.id ? { ...w, ...input } : w,
			);
			electronStore.set("workspaces", updated);

			return { success: true };
		},
	);

	// Delete workspace reference
	ipcMain.handle(
		"workspace-delete",
		async (_event, input: { id: string; removeWorktree?: boolean }) => {
			const workspaces = electronStore.get("workspaces", []);
			electronStore.set("workspaces", workspaces.filter((w) => w.id !== input.id));

			if (electronStore.get("lastWorkspaceId") === input.id) {
				electronStore.set("lastWorkspaceId", null);
			}

			return { success: true };
		},
	);

	// Get last opened workspace
	ipcMain.handle("workspace-get-last-opened", async () => {
		const lastId = electronStore.get("lastWorkspaceId", null);
		if (!lastId) return null;

		return await getWorkspaceWithGitData(lastId);
	});

	// ========================================
	// WORKTREE OPERATIONS
	// ========================================

	// Create git worktree (doesn't persist to config, just creates on disk)
	ipcMain.handle(
		"worktree-create",
		async (_event, input: CreateWorktreeInput) => {
			const workspaceRef = electronStore
				.get("workspaces", [])
				.find((w) => w.id === input.workspaceId);
			if (!workspaceRef) {
				return { success: false, error: "Workspace not found" };
			}

			// Create git worktree
			const result = await worktreeManager.createWorktree(
				workspaceRef.repoPath,
				input.branch,
				input.createBranch || false,
			);

			return result;
		},
	);

	// Scan worktrees (just returns current git worktrees, doesn't persist)
	ipcMain.handle("workspace-scan-worktrees", async (_event, workspaceId: string) => {
		const workspace = await getWorkspaceWithGitData(workspaceId);
		if (!workspace) {
			return { success: false, error: "Workspace not found" };
		}

		return {
			success: true,
			workspace,
			imported: workspace.worktrees.length,
		};
	});

	// ========================================
	// TAB GROUP / TAB OPERATIONS
	// These will be managed in renderer via Zustand (runtime state)
	// Keeping stubs for now to avoid breaking existing code
	// ========================================

	ipcMain.handle(
		"tab-group-create",
		async (_event, input: CreateTabGroupInput) => {
			// TODO: This should be handled in renderer (instantiate template)
			return { success: true };
		},
	);

	ipcMain.handle("tab-create", async (_event, input: CreateTabInput) => {
		// TODO: This should be handled in renderer
		return { success: true };
	});

	// Get active selection (from config)
	ipcMain.handle("workspace-get-active-selection", async () => {
		return {
			worktreeId: null,
			tabGroupId: null,
			tabId: null,
		};
	});

	// Set active selection (to config)
	// NOTE: We may not need this anymore since selections are runtime-only
	ipcMain.handle(
		"workspace-set-active-selection",
		async (
			_event,
			_input: {
				worktreeId: string | null;
				tabGroupId: string | null;
				tabId: string | null;
			},
		) => {
			// No-op for now, selections are runtime-only
		},
	);

	// Terminal CWD updates (for persistence across restarts)
	// NOTE: May not need this if sessions are ephemeral
	ipcMain.handle(
		"workspace-update-terminal-cwd",
		async (
			_event,
			_input: {
				workspaceId: string;
				worktreeId: string;
				tabGroupId: string;
				tabId: string;
				cwd: string;
			},
		) => {
			// No-op for now
			return true;
		},
	);

	// Tab/TabGroup reordering (runtime-only, handled in renderer)
	ipcMain.handle("tab-reorder", async () => ({ success: true }));
	ipcMain.handle("tab-group-reorder", async () => ({ success: true }));
	ipcMain.handle("tab-move-to-group", async () => ({ success: true }));

	// ========================================
	// CONFIG OPERATIONS (simple get/set API for renderer)
	// ========================================

	// Get entire config state
	ipcMain.handle("config:get", async () => {
		return electronStore.store; // Returns { workspaces, lastWorkspaceId, tabGroupTemplates }
	});

	// Set entire config state (or partial updates)
	ipcMain.handle("config:set", async (_event, data: any) => {
		// Merge partial updates with existing state
		electronStore.set(data);
		return electronStore.store; // Return updated state
	});
}

// ========================================
// HELPER: Merge workspace ref + live git data
// ========================================
async function getWorkspaceWithGitData(
	id: string,
): Promise<Workspace | null> {
	const workspaceRef = electronStore.get("workspaces", []).find((w) => w.id === id);
	if (!workspaceRef) return null;

	// Get current branch from git
	const currentBranch = worktreeManager.getCurrentBranch(workspaceRef.repoPath);
	if (!currentBranch) return null;

	// Fetch live worktrees from git
	const gitWorktrees = worktreeManager.listWorktrees(workspaceRef.repoPath);
	const liveWorktrees: Worktree[] = gitWorktrees
		.filter((wt) => !wt.bare)
		.map((gitWorktree) => {
			const actualBranch =
				worktreeManager.getCurrentBranch(gitWorktree.path) ||
				gitWorktree.branch;

			return {
				id: randomUUID(),
				branch: actualBranch,
				path: gitWorktree.path,
				tabGroups: [], // Runtime state, managed by renderer
				createdAt: new Date().toISOString(),
			};
		});

	// Merge config + git data
	return {
		id: workspaceRef.id,
		name: workspaceRef.name,
		repoPath: workspaceRef.repoPath,
		branch: currentBranch,
		worktrees: liveWorktrees,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	};
}
