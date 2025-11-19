import { app, type BrowserWindow, dialog, Menu } from "electron";
import windowManager from "./window-manager";
import workspaceManager from "./workspace-manager";

export function createApplicationMenu(mainWindow: BrowserWindow) {
	const template: Electron.MenuItemConstructorOptions[] = [
		{
			label: "File",
			submenu: [
				{
					label: "New Window",
					accelerator: "CmdOrCtrl+Shift+N",
					click: async () => {
						try {
							await windowManager.createWindow();
						} catch (error) {
							console.error("[Menu] Failed to create new window:", error);
							dialog.showErrorBox(
								"Error",
								"Failed to create new window: " +
									(error instanceof Error ? error.message : "Unknown error"),
							);
						}
					},
				},
				{ type: "separator" },
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

						// Get current branch
						const worktreeManager = (await import("./worktree-manager"))
							.default;
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
						const existingWorkspaces = await workspaceManager.list();
						const existingWorkspace = existingWorkspaces.find(
							(ws) => ws.repoPath === repoPath,
						);

						if (existingWorkspace) {
							// Workspace already exists, just switch to it
							console.log(
								"[Menu] Workspace already exists, switching to:",
								existingWorkspace,
							);
							mainWindow.webContents.send(
								"workspace-opened",
								existingWorkspace,
							);
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
						console.log(
							"[Menu] Sending workspace-opened event:",
							createResult.workspace,
						);
						mainWindow.webContents.send(
							"workspace-opened",
							createResult.workspace,
						);
						console.log("[Menu] Event sent");
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
				// Custom close handler to prevent Cmd+W from closing the window
				// Arc-style behavior: Cmd+W closes tabs/terminals, Cmd+Shift+W closes window
				// This allows renderer-side shortcuts to handle Cmd+W for closing content
				{
					label: "Close Window",
					accelerator: "CmdOrCtrl+Shift+W",
					click: () => {
						mainWindow.close();
					},
				},
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
