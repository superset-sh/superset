import { join } from "node:path";
import { screen } from "electron";

import { createWindow } from "lib/electron-app/factories/windows/create";
import { displayName } from "~/package.json";
import { createApplicationMenu } from "../lib/menu";
import {
	type PortClosedEvent,
	type PortDetectedEvent,
	portDetector,
} from "../lib/port-detector";
import { registerTerminalIPCs } from "../lib/terminal-ipcs";
import {
	getActiveWorkspaceId,
	updateDetectedPorts,
} from "../lib/workspace/workspace-operations";
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

	// Register terminal IPCs for this window
	const cleanupTerminal = registerTerminalIPCs(window);

	// Set up port detection listeners
	portDetector.on("port-detected", async (event: PortDetectedEvent) => {
		const { worktreeId } = event;

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
				}
				break;
			}
		}
	});

	portDetector.on("port-closed", async (event: PortClosedEvent) => {
		const { worktreeId } = event;

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
					await workspaceManager.initializeProxyForWorkspace(activeWorkspaceId);
				}
			}
		} catch (error) {
			console.error("[Main] Failed to initialize proxy on startup:", error);
		}
	});

	window.on("close", () => {
		// Clean up terminal processes for this window
		cleanupTerminal();

		// Note: Don't destroy other windows - let them close independently
		// Each window manages its own lifecycle
	});

	return window;
}
