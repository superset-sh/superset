import { existsSync } from "node:fs";
import { join } from "node:path";
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
import { DaemonTerminalManager } from "main/lib/terminal/daemon-manager";
import { getTerminalHostClient } from "main/lib/terminal-host/client";
import type { ListSessionsResponse } from "main/lib/terminal-host/types";

const POLL_INTERVAL_MS = 5000;

/** Must have "Template" suffix for macOS dark/light mode support */
const TRAY_ICON_FILENAME = "iconTemplate.png";

function getTrayIconPath(): string | null {
	if (app.isPackaged) {
		const prodPath = join(
			process.resourcesPath,
			"app.asar.unpacked/resources/tray",
			TRAY_ICON_FILENAME,
		);
		if (existsSync(prodPath)) return prodPath;
		return null;
	}

	const previewPath = join(__dirname, "../resources/tray", TRAY_ICON_FILENAME);
	if (existsSync(previewPath)) {
		return previewPath;
	}

	const devPath = join(
		app.getAppPath(),
		"src/resources/tray",
		TRAY_ICON_FILENAME,
	);
	if (existsSync(devPath)) {
		return devPath;
	}

	console.warn("[Tray] Icon not found at:", previewPath, "or", devPath);
	return null;
}

let tray: Tray | null = null;
let pollIntervalId: ReturnType<typeof setInterval> | null = null;

function createTrayIcon(): Electron.NativeImage | null {
	const iconPath = getTrayIconPath();
	if (!iconPath) {
		console.warn("[Tray] Icon not found");
		return null;
	}

	try {
		let image = nativeImage.createFromPath(iconPath);
		const size = image.getSize();

		if (image.isEmpty() || size.width === 0 || size.height === 0) {
			console.warn("[Tray] Icon loaded with zero size from:", iconPath);
			return null;
		}

		// 16x16 is standard menu bar size, auto-scales for Retina
		if (size.width > 22 || size.height > 22) {
			image = image.resize({ width: 16, height: 16 });
		}
		image.setTemplateImage(true);
		return image;
	} catch (error) {
		console.warn("[Tray] Failed to load icon:", error);
		return null;
	}
}

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
		// Triggers window creation via makeAppSetup's activate handler
		app.emit("activate");
	}
}

function openSettings(): void {
	showWindow();
	const windows = BrowserWindow.getAllWindows();
	if (windows.length > 0) {
		windows[0].webContents.send("navigate", "/settings");
	}
}

function openSessionInSuperset(workspaceId: string): void {
	showWindow();
	const windows = BrowserWindow.getAllWindows();
	if (windows.length > 0) {
		windows[0].webContents.send("navigate", `/workspace/${workspaceId}`);
	}
}

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

	await updateTrayMenu();
}

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

	await updateTrayMenu();
}

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

function formatSessionLabel(
	session: ListSessionsResponse["sessions"][0],
): string {
	const attached = session.attachedClients > 0 ? " (attached)" : "";
	const shellName = session.shell?.split("/").pop() || "shell";
	return `${shellName}${attached}`;
}

function buildSessionsSubmenu(
	sessions: ListSessionsResponse["sessions"],
	daemonEnabled: boolean,
): MenuItemConstructorOptions[] {
	const aliveSessions = sessions.filter((s) => s.isAlive);
	const menuItems: MenuItemConstructorOptions[] = [];

	if (aliveSessions.length === 0) {
		menuItems.push({ label: "No active sessions", enabled: false });
	} else {
		const byWorkspace = new Map<string, ListSessionsResponse["sessions"]>();
		for (const session of aliveSessions) {
			const existing = byWorkspace.get(session.workspaceId) || [];
			existing.push(session);
			byWorkspace.set(session.workspaceId, existing);
		}

		let isFirst = true;
		for (const [workspaceId, workspaceSessions] of byWorkspace) {
			const workspaceName = getWorkspaceName(workspaceId);

			if (!isFirst) {
				menuItems.push({ type: "separator" });
			}
			menuItems.push({
				label: workspaceName,
				enabled: false,
			});

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

		menuItems.push({ type: "separator" });
		menuItems.push({
			label: "Kill All Sessions",
			click: killAllSessions,
		});
	}

	menuItems.push({
		label: "Restart Daemon",
		enabled: daemonEnabled,
		click: restartDaemon,
	});

	return menuItems;
}

async function restartDaemon(): Promise<void> {
	try {
		const client = getTerminalHostClient();
		await client.shutdownIfRunning({ killSessions: true });
		// Daemon auto-spawns on next terminal operation
		console.log("[Tray] Daemon restarted (will spawn on next use)");
	} catch (error) {
		console.error("[Tray] Failed to restart daemon:", error);
	}

	await updateTrayMenu();
}

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
		} catch {}
	}

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

/** Call once after app.whenReady() */
export function initTray(): void {
	if (tray) {
		console.warn("[Tray] Already initialized");
		return;
	}

	if (process.platform !== "darwin") {
		return;
	}

	try {
		const icon = createTrayIcon();
		if (!icon) {
			console.warn("[Tray] Skipping initialization - no icon available");
			return;
		}

		tray = new Tray(icon);
		tray.setToolTip("Superset");

		updateTrayMenu().catch((error) => {
			console.error("[Tray] Failed to build initial menu:", error);
		});

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

/** Call on app quit */
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
