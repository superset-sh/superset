/**
 * macOS Menu Bar Tray Manager
 *
 * Provides a system tray icon for managing the terminal host daemon
 * and accessing the app when the main window is closed.
 */

import { workspaces } from "@superset/local-db";
import { eq } from "drizzle-orm";
import {
	app,
	BrowserWindow,
	Menu,
	type MenuItemConstructorOptions,
	nativeImage,
	Tray,
} from "electron";
import { localDb } from "main/lib/local-db";
import {
	getActiveTerminalManager,
	isDaemonModeEnabled,
} from "main/lib/terminal";
import { getTerminalHostClient } from "main/lib/terminal-host/client";
import type { ListSessionsResponse } from "main/lib/terminal-host/types";
import { DaemonTerminalManager } from "main/lib/terminal/daemon-manager";
import { existsSync } from "node:fs";
import { join } from "node:path";

// =============================================================================
// Constants
// =============================================================================

/** Interval for polling daemon session count (ms) */
const POLL_INTERVAL_MS = 5000;

/** Icon filename - must have "Template" suffix for macOS dark/light mode support */
const TRAY_ICON_FILENAME = "iconTemplate.png";

/**
 * Get the path to the tray icon file.
 * Path resolution strategy mirrors sound-paths.ts:
 * - Production (packaged .app): app.asar.unpacked/resources/tray/
 * - Development (NODE_ENV=development): src/resources/tray/
 * - Preview (electron-vite preview): dist/resources/tray/
 */
function getTrayIconPath(): string | null {
	if (app.isPackaged) {
		// Production: unpacked from asar so Tray can access it
		const prodPath = join(
			process.resourcesPath,
			"app.asar.unpacked/resources/tray",
			TRAY_ICON_FILENAME,
		);
		if (existsSync(prodPath)) return prodPath;
		return null;
	}

	// Try preview path first (dist/resources/tray)
	const previewPath = join(__dirname, "../resources/tray", TRAY_ICON_FILENAME);
	if (existsSync(previewPath)) {
		return previewPath;
	}

	// Try development path (src/resources/tray)
	const devPath = join(
		app.getAppPath(),
		"src/resources/tray",
		TRAY_ICON_FILENAME,
	);
	if (existsSync(devPath)) {
		return devPath;
	}

	// Not found
	console.warn("[Tray] Icon not found at:", previewPath, "or", devPath);
	return null;
}

// =============================================================================
// State
// =============================================================================

let tray: Tray | null = null;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

// =============================================================================
// Icon Generation
// =============================================================================

/**
 * Create tray icon, loading from file if available, otherwise falling back
 * to a programmatic placeholder icon.
 */
function createTrayIcon(): Electron.NativeImage {
	// Try loading from file first
	const iconPath = getTrayIconPath();
	if (iconPath) {
		try {
			let image = nativeImage.createFromPath(iconPath);
			const size = image.getSize();
			console.log("[Tray] Loaded image size:", size);

			if (!image.isEmpty() && size.width > 0 && size.height > 0) {
				// Resize to standard menu bar size (16x16 for @1x, will auto-scale for Retina)
				if (size.width > 22 || size.height > 22) {
					image = image.resize({ width: 16, height: 16 });
				}
				image.setTemplateImage(true);
				console.log("[Tray] Loaded icon from:", iconPath);
				return image;
			}
			console.warn("[Tray] Icon loaded with zero size from:", iconPath);
		} catch (error) {
			console.warn("[Tray] Failed to load icon:", error);
		}
	}

	// Fall back to programmatic placeholder icon
	return createFallbackIcon();
}

/**
 * Create a simple placeholder template icon for macOS menu bar.
 * This is a 16x16 terminal-style icon ("> _" prompt symbol).
 *
 * For macOS, template images should be black with transparency.
 * The system automatically handles dark/light mode adaptation.
 */
function createFallbackIcon(): Electron.NativeImage {
	// 16x16 PNG with a simple terminal prompt icon (">_")
	// Created programmatically - this is a placeholder until a proper icon is designed
	// The icon is black on transparent background for macOS template image support
	const size = 16;

	// Using raw RGBA data to create a template image
	const canvas = Buffer.alloc(size * size * 4);

	// Template images should be black (#000000) with varying alpha
	const drawPixel = (x: number, y: number, alpha: number) => {
		if (x >= 0 && x < size && y >= 0 && y < size) {
			const offset = (y * size + x) * 4;
			canvas[offset] = 0; // R
			canvas[offset + 1] = 0; // G
			canvas[offset + 2] = 0; // B
			canvas[offset + 3] = alpha; // A
		}
	};

	// Draw a simple terminal prompt ">_" shape
	// ">" part (lines from 3,4 to 7,8 and 7,8 to 3,12)
	for (let i = 0; i < 4; i++) {
		drawPixel(3 + i, 4 + i, 255);
		drawPixel(4 + i, 4 + i, 200);
		drawPixel(3 + i, 12 - i, 255);
		drawPixel(4 + i, 12 - i, 200);
	}

	// "_" part (horizontal line at bottom)
	for (let x = 9; x < 14; x++) {
		drawPixel(x, 11, 255);
		drawPixel(x, 12, 200);
	}

	const image = nativeImage.createFromBuffer(canvas, {
		width: size,
		height: size,
	});

	// Mark as template image for macOS (enables automatic dark/light mode)
	image.setTemplateImage(true);

	console.log("[Tray] Using fallback programmatic icon");
	return image;
}

// =============================================================================
// Menu Actions
// =============================================================================

/**
 * Show or create the main window
 */
function showWindow(): void {
	const windows = BrowserWindow.getAllWindows();

	if (windows.length > 0) {
		const mainWindow = windows[0];
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
	} else {
		// No window exists - emit activate to trigger window creation
		// This works because makeAppSetup sets up the activate handler
		app.emit("activate");
	}
}

/**
 * Open settings page in main window
 */
function openSettings(): void {
	showWindow();
	// Send message to renderer to navigate to settings
	const windows = BrowserWindow.getAllWindows();
	if (windows.length > 0) {
		windows[0].webContents.send("navigate", "/settings");
	}
}

/**
 * Open a specific session/workspace in Superset
 */
function openSessionInSuperset(workspaceId: string): void {
	showWindow();
	// Send message to renderer to navigate to the workspace
	const windows = BrowserWindow.getAllWindows();
	if (windows.length > 0) {
		windows[0].webContents.send("navigate", `/workspace/${workspaceId}`);
	}
}

/**
 * Kill all terminal sessions in the daemon
 */
async function killAllSessions(): Promise<void> {
	try {
		const manager = getActiveTerminalManager();
		if (manager instanceof DaemonTerminalManager) {
			await manager.forceKillAll();
			console.log("[Tray] Killed all daemon sessions");
		}
	} catch (error) {
		console.error("[Tray] Failed to kill sessions:", error);
	}

	// Update menu to reflect new state
	await updateTrayMenu();
}

/**
 * Kill a specific terminal session
 */
async function killSession(paneId: string): Promise<void> {
	try {
		const manager = getActiveTerminalManager();
		if (manager instanceof DaemonTerminalManager) {
			await manager.kill({ paneId, deleteHistory: false });
			console.log(`[Tray] Killed session: ${paneId}`);
		}
	} catch (error) {
		console.error(`[Tray] Failed to kill session ${paneId}:`, error);
	}

	// Update menu to reflect new state
	await updateTrayMenu();
}

/**
 * Get workspace name from database
 */
function getWorkspaceName(workspaceId: string): string {
	try {
		const workspace = localDb
			.select({ name: workspaces.name })
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		return workspace?.name || workspaceId.slice(0, 8);
	} catch {
		return workspaceId.slice(0, 8);
	}
}

/**
 * Format session display label
 */
function formatSessionLabel(
	session: ListSessionsResponse["sessions"][0],
): string {
	const attached = session.attachedClients > 0 ? " (attached)" : "";
	const shellName = session.shell?.split("/").pop() || "shell";
	return `${shellName}${attached}`;
}

/**
 * Build sessions submenu grouped by workspace
 */
function buildSessionsSubmenu(
	sessions: ListSessionsResponse["sessions"],
	daemonEnabled: boolean,
): MenuItemConstructorOptions[] {
	const aliveSessions = sessions.filter((s) => s.isAlive);
	const menuItems: MenuItemConstructorOptions[] = [];

	if (aliveSessions.length === 0) {
		menuItems.push({ label: "No active sessions", enabled: false });
	} else {
		// Group sessions by workspace
		const byWorkspace = new Map<string, ListSessionsResponse["sessions"]>();
		for (const session of aliveSessions) {
			const existing = byWorkspace.get(session.workspaceId) || [];
			existing.push(session);
			byWorkspace.set(session.workspaceId, existing);
		}

		// Build flat list with workspace headers as separators
		let isFirst = true;
		for (const [workspaceId, workspaceSessions] of byWorkspace) {
			const workspaceName = getWorkspaceName(workspaceId);

			// Add separator with workspace name as header
			if (!isFirst) {
				menuItems.push({ type: "separator" });
			}
			menuItems.push({
				label: workspaceName,
				enabled: false,
			});

			// Add individual sessions with submenu
			for (const session of workspaceSessions) {
				menuItems.push({
					label: formatSessionLabel(session),
					submenu: [
						{
							label: "Open in Superset",
							click: () => openSessionInSuperset(session.workspaceId),
						},
						{
							label: "Kill",
							click: () => killSession(session.paneId),
						},
					],
				});
			}

			isFirst = false;
		}

		// Add Kill All Sessions at the bottom
		menuItems.push({ type: "separator" });
		menuItems.push({
			label: "Kill All Sessions",
			click: killAllSessions,
		});
	}

	// Always show Restart Daemon option
	menuItems.push({
		label: "Restart Daemon",
		enabled: daemonEnabled,
		click: restartDaemon,
	});

	return menuItems;
}

/**
 * Restart the terminal host daemon
 */
async function restartDaemon(): Promise<void> {
	try {
		const client = getTerminalHostClient();

		// Shutdown existing daemon (if running)
		await client.shutdownIfRunning({ killSessions: true });

		// The daemon will be auto-spawned on next terminal operation
		console.log("[Tray] Daemon restarted (will spawn on next use)");
	} catch (error) {
		console.error("[Tray] Failed to restart daemon:", error);
	}

	// Update menu to reflect new state
	await updateTrayMenu();
}

// =============================================================================
// Menu Building
// =============================================================================

/**
 * Update the tray context menu with current daemon status
 */
async function updateTrayMenu(): Promise<void> {
	if (!tray) return;

	const daemonEnabled = isDaemonModeEnabled();
	let sessionCount = 0;
	let sessions: ListSessionsResponse["sessions"] = [];

	if (daemonEnabled) {
		try {
			const manager = getActiveTerminalManager();
			if (manager instanceof DaemonTerminalManager) {
				const result = await manager.listDaemonSessions();
				sessions = result.sessions;
				sessionCount = sessions.filter((s) => s.isAlive).length;
			}
		} catch {
			// Daemon not running - sessions will be empty
		}
	}

	// Build sessions submenu
	const sessionsSubmenu = buildSessionsSubmenu(sessions, daemonEnabled);
	const sessionsLabel =
		sessionCount > 0
			? `Background Sessions (${sessionCount})`
			: "Background Sessions";

	const menu = Menu.buildFromTemplate([
		{
			label: sessionsLabel,
			submenu: sessionsSubmenu,
		},
		{ type: "separator" },
		{
			label: "Open Superset",
			click: showWindow,
		},
		{
			label: "Settings",
			click: openSettings,
		},
		{
			label: "Quit",
			click: () => app.quit(),
		},
	]);

	tray.setContextMenu(menu);
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Initialize the system tray.
 * Should be called once after app.whenReady().
 */
export function initTray(): void {
	if (tray) {
		console.warn("[Tray] Already initialized");
		return;
	}

	// Only show tray on macOS
	if (process.platform !== "darwin") {
		return;
	}

	try {
		const icon = createTrayIcon();
		tray = new Tray(icon);
		tray.setToolTip("Superset");

		// Build initial menu
		updateTrayMenu().catch((error) => {
			console.error("[Tray] Failed to build initial menu:", error);
		});

		// Poll for session count updates
		pollIntervalId = setInterval(() => {
			updateTrayMenu().catch((error) => {
				console.error("[Tray] Failed to update menu:", error);
			});
		}, POLL_INTERVAL_MS);

		console.log("[Tray] Initialized successfully");
	} catch (error) {
		console.error("[Tray] Failed to initialize:", error);
	}
}

/**
 * Dispose of the tray and stop polling.
 * Should be called on app quit.
 */
export function disposeTray(): void {
	if (pollIntervalId) {
		clearInterval(pollIntervalId);
		pollIntervalId = null;
	}

	if (tray) {
		tray.destroy();
		tray = null;
	}
}
