import { app, type BrowserWindow, dialog, Menu } from "electron";
import { randomUUID } from "node:crypto";
import { electronStore } from "./config-store";
import worktreeManager from "./worktree-manager";

export function createApplicationMenu(mainWindow: BrowserWindow) {
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: "File",
			submenu: [
				{
					label: "Open Repository...",
					accelerator: "CmdOrCtrl+O",
					click: async () => {
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
							dialog.showErrorBox(
								"Error",
								"Could not determine current branch.",
							);
							return;
						}

						// Check if workspace already exists for this repo
						const existingWorkspaces = electronStore.get("workspaces", []);
						const existingWorkspace = existingWorkspaces.find(
							(ws) => ws.repoPath === repoPath,
						);

						if (existingWorkspace) {
							// Workspace already exists, fetch with live git data
							const gitWorktrees = worktreeManager.listWorktrees(repoPath);
							const workspace = {
								id: existingWorkspace.id,
								name: existingWorkspace.name,
								repoPath: existingWorkspace.repoPath,
								branch: currentBranch,
								worktrees: gitWorktrees
									.filter((wt) => !wt.bare)
									.map((gitWorktree) => ({
										id: randomUUID(),
										branch:
											worktreeManager.getCurrentBranch(gitWorktree.path) ||
											gitWorktree.branch,
										path: gitWorktree.path,
										tabGroups: [],
										createdAt: new Date().toISOString(),
									})),
								createdAt: new Date().toISOString(),
								updatedAt: new Date().toISOString(),
							};

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
						const gitWorktrees = worktreeManager.listWorktrees(repoPath);
						const workspace = {
							id: workspaceRef.id,
							name: workspaceRef.name,
							repoPath: workspaceRef.repoPath,
							branch: currentBranch,
							worktrees: gitWorktrees
								.filter((wt) => !wt.bare)
								.map((gitWorktree) => ({
									id: randomUUID(),
									branch:
										worktreeManager.getCurrentBranch(gitWorktree.path) ||
										gitWorktree.branch,
									path: gitWorktree.path,
									tabGroups: [],
									createdAt: new Date().toISOString(),
								})),
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
						};

						mainWindow.webContents.send("workspace-opened", workspace);
					},
				},
				{ type: "separator" },
				{ role: "quit" },
			],
		},
		{
			label: "Edit",
			submenu: [
				{ role: "undo" },
				{ role: "redo" },
				{ type: "separator" },
				{ role: "cut" },
				{ role: "copy" },
				{ role: "paste" },
				{ role: "selectAll" },
			],
		},
		{
			label: "View",
			submenu: [
				{ role: "reload" },
				{ role: "forceReload" },
				{ role: "toggleDevTools" },
				{ type: "separator" },
				{ role: "resetZoom" },
				{ role: "zoomIn" },
				{ role: "zoomOut" },
				{ type: "separator" },
				{ role: "togglefullscreen" },
			],
		},
		{
			label: "Window",
			submenu: [
				{ role: "minimize" },
				{ role: "zoom" },
				{ type: "separator" },
				{ role: "close" },
			],
		},
	];

	// Add About menu on macOS
	if (process.platform === "darwin") {
		template.unshift({
			label: app.name,
			submenu: [
				{ role: "about" },
				{ type: "separator" },
				{ role: "services" },
				{ type: "separator" },
				{ role: "hide" },
				{ role: "hideOthers" },
				{ role: "unhide" },
				{ type: "separator" },
				{ role: "quit" },
			],
		});
	}

	const menu = Menu.buildFromTemplate(template);
	Menu.setApplicationMenu(menu);
}
