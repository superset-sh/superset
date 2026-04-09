import { existsSync } from "node:fs";
import { join } from "node:path";
import {
	app,
	Menu,
	type MenuItemConstructorOptions,
	nativeImage,
	Tray,
} from "electron";
import { loadToken } from "lib/trpc/routers/auth/utils/auth-functions";
import { env } from "main/env.main";
import { focusMainWindow, quitApp } from "main/index";
import {
	getHostServiceCoordinator,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
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

// Background cache of host.info data per org
const hostInfoCache = new Map<
	string,
	{ organizationName: string; version: string; uptime: number }
>();

function refreshHostInfo(): void {
	const coordinator = getHostServiceCoordinator();
	for (const orgId of coordinator.getActiveOrganizationIds()) {
		const connection = coordinator.getConnection(orgId);
		if (!connection) continue;

		void fetch(`http://127.0.0.1:${connection.port}/trpc/host.info`, {
			headers: { Authorization: `Bearer ${connection.secret}` },
		})
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (!data?.result?.data) return;
				const info = data.result.data;
				hostInfoCache.set(orgId, {
					organizationName: info.organization?.name ?? orgId.slice(0, 8),
					version: info.version ?? "",
					uptime: info.uptime ?? 0,
				});
			})
			.catch(() => {});
	}
}

function buildHostServiceSubmenu(): MenuItemConstructorOptions[] {
	const coordinator = getHostServiceCoordinator();
	const orgIds = coordinator.getActiveOrganizationIds();
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

			const status = coordinator.getProcessStatus(orgId);
			const cached = hostInfoCache.get(orgId);
			const isRunning = status === "running";
			const label = cached?.organizationName ?? orgId.slice(0, 8);
			const versionSuffix = cached?.version ? ` (v${cached.version})` : "";

			menuItems.push({
				label,
				enabled: false,
			});

			menuItems.push({
				label: `  ${status}${versionSuffix}`,
				enabled: false,
			});

			menuItems.push({
				label: "  Restart",
				enabled: isRunning,
				click: () => {
					void (async () => {
						try {
							const { token } = await loadToken();
							if (!token) return;
							await coordinator.restart(orgId, {
								authToken: token,
								cloudApiUrl: env.NEXT_PUBLIC_API_URL,
							});
						} catch (error) {
							console.error(
								`[Tray] Failed to restart host-service for ${orgId}:`,
								error,
							);
						}
						updateTrayMenu();
					})();
				},
			});

			menuItems.push({
				label: "  Stop",
				enabled: isRunning,
				click: () => {
					coordinator.stop(orgId);
					updateTrayMenu();
				},
			});
		}
	}

	return menuItems;
}

function updateTrayMenu(): void {
	if (!tray) return;

	refreshHostInfo();

	const coordinator = getHostServiceCoordinator();
	const orgIds = coordinator.getActiveOrganizationIds();

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
		{
			label: "Quit Superset",
			click: () => quitApp(),
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

		updateTrayMenu();

		const manager = getHostServiceCoordinator();
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
