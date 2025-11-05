import { join } from "node:path";
import { BrowserWindow, ipcMain, screen, shell } from "electron";

import { createWindow } from "lib/electron-app/factories/windows/create";
import { ENVIRONMENT } from "shared/constants";
import { displayName } from "~/package.json";
import { createApplicationMenu } from "../lib/menu";
import { portDetector } from "../lib/port-detector";
import { registerPortIpcs } from "../lib/port-ipcs";
import { registerTerminalIPCs } from "../lib/terminal-ipcs";
import {
	getActiveWorkspaceId,
	updateDetectedPorts,
} from "../lib/workspace/workspace-operations";
import { registerWorkspaceIPCs } from "../lib/workspace-ipcs";
import workspaceManager from "../lib/workspace-manager";

export async function MainWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const window = createWindow({
		id: "main",
		title: displayName,
		width,
		height,
		show: false,
		center: true,
		movable: true,
		resizable: true,
		alwaysOnTop: false,
		autoHideMenuBar: true,
		frame: false,
		titleBarStyle: "hidden",
		trafficLightPosition: { x: 16, y: 16 },

		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			webviewTag: true,
		},
	});

	// Register IPC handlers
	const cleanupTerminal = registerTerminalIPCs(window);
	registerWorkspaceIPCs();
	registerPortIpcs();

	// Set up port detection listeners
	portDetector.on("port-detected", async (event: any) => {
		const { worktreeId, port, service } = event;
		console.log(
			`[Main] Port detected: ${port}${service ? ` (${service})` : ""} in worktree ${worktreeId}`,
		);

		// Get detected ports map for this worktree
		const detectedPorts = portDetector.getDetectedPortsMap(worktreeId);

		// Find workspace that contains this worktree
		const workspaces = await workspaceManager.list();
		for (const workspace of workspaces) {
			const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
			if (worktree) {
				// Update detected ports in config
				updateDetectedPorts(workspace.id, worktreeId, detectedPorts);

				// Update proxy if this is the active worktree
				if (workspace.activeWorktreeId === worktreeId) {
					await workspaceManager.updateProxyTargets(workspace.id);
					console.log(
						`[Main] Updated proxy targets for active worktree ${worktree.branch}`,
					);
				}
				break;
			}
		}
	});

	portDetector.on("port-closed", async (event: any) => {
		const { worktreeId, port } = event;
		console.log(`[Main] Port closed: ${port} in worktree ${worktreeId}`);

		// Get updated detected ports map
		const detectedPorts = portDetector.getDetectedPortsMap(worktreeId);

		// Find workspace and update
		const workspaces = await workspaceManager.list();
		for (const workspace of workspaces) {
			const worktree = workspace.worktrees.find((wt) => wt.id === worktreeId);
			if (worktree) {
				updateDetectedPorts(workspace.id, worktreeId, detectedPorts);

				// Update proxy if this is the active worktree
				if (workspace.activeWorktreeId === worktreeId) {
					await workspaceManager.updateProxyTargets(workspace.id);
				}
				break;
			}
		}
	});

	// Create application menu
	createApplicationMenu(window);

	window.webContents.on("did-finish-load", async () => {
		window.show();

		// Initialize proxy for active workspace on startup
		try {
			const activeWorkspaceId = getActiveWorkspaceId();

			if (activeWorkspaceId) {
				const activeWorkspace = await workspaceManager.get(activeWorkspaceId);

				if (activeWorkspace?.ports && activeWorkspace.ports.length > 0) {
					console.log(
						`[Main] Initializing proxy for workspace: ${activeWorkspace.name}`,
					);
					await workspaceManager.initializeProxyForWorkspace(activeWorkspaceId);
				}
			}
		} catch (error) {
			console.error("[Main] Failed to initialize proxy on startup:", error);
		}
	});

	window.on("close", () => {
		// Clean up terminal processes
		cleanupTerminal();

		for (const window of BrowserWindow.getAllWindows()) {
			window.destroy();
		}
	});

	return window;
}
