import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	app,
	Menu,
	type MenuItemConstructorOptions,
	nativeImage,
	Tray,
} from "electron";
import { focusMainWindow, requestQuit } from "main/index";
import {
	getHostServiceManager,
	type HostServiceStatus,
	type HostServiceStatusEvent,
} from "main/lib/host-service-manager";
import { menuEmitter } from "main/lib/menu-events";

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

function openSettings(): void {
	focusMainWindow();
	menuEmitter.emit("open-settings");
}

function formatStatusLabel(status: HostServiceStatus): string {
	switch (status) {
		case "running":
			return "Running";
		case "starting":
			return "Starting...";
		case "degraded":
			return "Degraded";
		case "restarting":
			return "Restarting...";
		case "stopped":
			return "Stopped";
	}
}

function buildHostServiceSubmenu(): MenuItemConstructorOptions[] {
	const manager = getHostServiceManager();
	const orgIds = manager.getActiveOrganizationIds();
	const menuItems: MenuItemConstructorOptions[] = [];

	if (orgIds.length === 0) {
		menuItems.push({ label: "No active services", enabled: false });
	} else {
		let isFirst = true;
		for (const orgId of orgIds) {
			if (!isFirst) {
				menuItems.push({ type: "separator" });
			}
			isFirst = false;

			const info = manager.getServiceInfo(orgId);
			const orgName = info.organizationName ?? orgId.slice(0, 8);
			const statusLabel = formatStatusLabel(info.status);
			const versionSuffix = info.serviceVersion
				? ` (v${info.serviceVersion})`
				: "";
			const isRunning = info.status === "running";

			menuItems.push({
				label: orgName,
				enabled: false,
			});

			menuItems.push({
				label: `  ${statusLabel}${versionSuffix}`,
				enabled: false,
			});

			if (info.uptime !== null) {
				const uptimeStr = formatUptime(info.uptime);
				menuItems.push({
					label: `  Uptime: ${uptimeStr}`,
					enabled: false,
				});
			}

			if (info.restartCount > 0) {
				menuItems.push({
					label: `  Restarts: ${info.restartCount}`,
					enabled: false,
				});
			}

			if (info.pendingRestart) {
				menuItems.push({
					label: "  Update required — restart to apply",
					enabled: false,
				});
			} else if (
				info.compatibility &&
				"updateAvailable" in info.compatibility &&
				info.compatibility.updateAvailable
			) {
				menuItems.push({
					label: "  Update available",
					enabled: false,
				});
			}

			menuItems.push({
				label: "  Restart",
				enabled: isRunning,
				click: () => {
					manager.restart(orgId).catch((err) => {
						console.error(
							`[Tray] Failed to restart host-service for ${orgId}:`,
							err,
						);
					});
					updateTrayMenu();
				},
			});

			menuItems.push({
				label: "  Stop",
				enabled: isRunning,
				click: () => {
					manager.stop(orgId);
					updateTrayMenu();
				},
			});
		}
	}

	return menuItems;
}

function formatUptime(seconds: number): string {
	if (seconds < 60) return `${seconds}s`;
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
	const hours = Math.floor(seconds / 3600);
	const mins = Math.floor((seconds % 3600) / 60);
	return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function updateTrayMenu(): void {
	if (!tray) return;

	const manager = getHostServiceManager();
	const orgIds = manager.getActiveOrganizationIds();

	const hasActive = orgIds.length > 0;
	const hostServiceLabel = hasActive
		? `Host Service (${orgIds.length})`
		: "Host Service";

	const hostServiceSubmenu = buildHostServiceSubmenu();

	const menu = Menu.buildFromTemplate([
		{
			label: hostServiceLabel,
			submenu: hostServiceSubmenu,
		},
		{ type: "separator" },
		{
			label: "Open Superset",
			click: focusMainWindow,
		},
		{
			label: "Settings",
			click: openSettings,
		},
		{
			label: "Check for Updates",
			click: () => {
				// Imported lazily to avoid circular dependency
				const { checkForUpdatesInteractive } = require("../auto-updater");
				checkForUpdatesInteractive();
			},
		},
		{ type: "separator" },
		...(hasActive
			? [
					{
						label: "Quit (Keep Services Running)",
						click: () => requestQuit("release"),
					},
					{
						label: "Quit & Stop Services",
						click: () => requestQuit("stop"),
					},
				]
			: [
					{
						label: "Quit",
						click: () => requestQuit("release"),
					},
				]),
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

		updateTrayMenu();

		const manager = getHostServiceManager();
		manager.on("status-changed", (_event: HostServiceStatusEvent) => {
			updateTrayMenu();
		});

		// Periodic refresh as a fallback
		pollIntervalId = setInterval(() => {
			updateTrayMenu();
		}, POLL_INTERVAL_MS);
		// Don't keep Electron alive just for tray updates
		pollIntervalId.unref();

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
