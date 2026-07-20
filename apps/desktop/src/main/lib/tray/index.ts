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
import { confirmAndQuitCompletely } from "main/lib/quit-completely";
import {
	getUsageCollector,
	USAGE_UPDATED_EVENT,
} from "main/lib/usage/usage-collector";
import { getUsageDisplaySettings } from "main/lib/usage/usage-settings";
import {
	type ProviderSnapshot,
	type RateLimitWindow,
	USAGE_PROVIDER_LABELS,
	worstWindowAcrossProviders,
} from "main/lib/usage/usage-snapshot";

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

interface HostInfo {
	organizationName: string;
	version: string;
}

async function fetchHostInfo(organizationId: string): Promise<HostInfo | null> {
	const connection = getHostServiceCoordinator().getConnection(organizationId);
	if (!connection) return null;

	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 2000);
	try {
		const res = await fetch(
			`http://127.0.0.1:${connection.port}/trpc/host.info`,
			{
				headers: { Authorization: `Bearer ${connection.secret}` },
				signal: controller.signal,
			},
		);
		if (!res.ok) return null;
		const data = await res.json();
		const info = data?.result?.data?.json;
		if (!info?.organization?.name) return null;
		return {
			organizationName: info.organization.name,
			version: info.version ?? "",
		};
	} catch {
		return null;
	} finally {
		clearTimeout(timeout);
	}
}

function buildHostServiceSubmenu(
	orgIds: string[],
	infos: Map<string, HostInfo>,
): MenuItemConstructorOptions[] {
	const coordinator = getHostServiceCoordinator();
	const menuItems: MenuItemConstructorOptions[] = [];

	if (orgIds.length === 0) {
		menuItems.push({ label: "No active services", enabled: false });
		return menuItems;
	}

	let isFirst = true;
	for (const orgId of orgIds) {
		if (!isFirst) {
			menuItems.push({ type: "separator" });
		}
		isFirst = false;

		const status = coordinator.getProcessStatus(orgId);
		const info = infos.get(orgId);
		const isRunning = status === "running";
		const label = info?.organizationName ?? "Loading…";
		const versionSuffix = info?.version ? ` (v${info.version})` : "";

		menuItems.push({ label, enabled: false });
		menuItems.push({
			label: `  ${status}${versionSuffix}`,
			enabled: false,
		});
		menuItems.push({
			// Enabled in "stopped" too — that's the state where users most need
			// restart to work (host-service crashed or never came up). Disabled
			// only while a start is in flight, to avoid racing the pending start.
			label: "  Restart",
			enabled: status !== "starting",
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
					void updateTrayMenu();
				})();
			},
		});
		menuItems.push({
			label: "  Stop",
			enabled: isRunning,
			click: () => {
				coordinator.stop(orgId);
				void updateTrayMenu();
			},
		});
	}

	return menuItems;
}

function formatTimeToReset(resetAt: Date | null): string | null {
	if (!resetAt) return null;
	const ms = resetAt.getTime() - Date.now();
	if (ms <= 0) return "now";
	const totalMinutes = Math.floor(ms / 60_000);
	const days = Math.floor(totalMinutes / 1440);
	const hours = Math.floor((totalMinutes % 1440) / 60);
	const minutes = totalMinutes % 60;
	if (days > 0) return `${days}d ${hours}h`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

function worstWindow(snapshot: ProviderSnapshot): RateLimitWindow | null {
	let worst: RateLimitWindow | null = null;
	for (const window of snapshot.windows) {
		if (!worst || window.usedPct > worst.usedPct) worst = window;
	}
	return worst;
}

function buildUsageSection(
	snapshots: ProviderSnapshot[],
): MenuItemConstructorOptions[] {
	const rows: MenuItemConstructorOptions[] = [];
	for (const snapshot of snapshots) {
		const window = worstWindow(snapshot);
		if (!window) continue;
		const resetLabel = formatTimeToReset(window.resetAt);
		const suffix = resetLabel ? ` · resets in ${resetLabel}` : "";
		rows.push({
			label: `${USAGE_PROVIDER_LABELS[snapshot.providerId]}  ${Math.round(window.usedPct)}%${suffix}`,
			enabled: false,
		});
	}

	if (rows.length === 0) return [];

	return [
		{ type: "separator" },
		{ label: "AI provider usage", enabled: false },
		...rows,
		{
			label: "View details →",
			click: () => {
				focusMainWindow();
				menuEmitter.emit("navigate", "/usage");
			},
		},
	];
}

function updateTrayTooltip(snapshots: ProviderSnapshot[]): void {
	if (!tray) return;
	const worst = worstWindowAcrossProviders(snapshots);
	const showPercentage = getUsageDisplaySettings().showTrayPercentage;
	if (showPercentage && worst !== null) {
		tray.setToolTip(`Superset · ${Math.round(worst)}%`);
	} else {
		tray.setToolTip("Superset");
	}
}

async function updateTrayMenu(): Promise<void> {
	if (!tray) return;

	const coordinator = getHostServiceCoordinator();
	const orgIds = coordinator.getActiveOrganizationIds();

	const infoEntries = await Promise.all(
		orgIds.map(async (orgId) => [orgId, await fetchHostInfo(orgId)] as const),
	);
	const infos = new Map<string, HostInfo>();
	for (const [orgId, info] of infoEntries) {
		if (info) infos.set(orgId, info);
	}

	if (!tray) return;

	const hasActive = orgIds.length > 0;
	const hostServiceLabel = hasActive
		? `Host Service (${orgIds.length})`
		: "Host Service";

	const hostServiceSubmenu = buildHostServiceSubmenu(orgIds, infos);

	const usageSnapshots = getUsageCollector().getSnapshots();
	updateTrayTooltip(usageSnapshots);

	const menu = Menu.buildFromTemplate([
		{
			label: hostServiceLabel,
			submenu: hostServiceSubmenu,
		},
		...buildUsageSection(usageSnapshots),
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
			label: "Close Superset",
			click: () => quitApp(),
		},
		{ type: "separator" },
		{
			label: "Quit Superset Completely",
			click: () => {
				void confirmAndQuitCompletely();
			},
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

		void updateTrayMenu();

		const manager = getHostServiceCoordinator();
		manager.on("status-changed", (_event: HostServiceStatusEvent) => {
			void updateTrayMenu();
		});

		getUsageCollector().on(USAGE_UPDATED_EVENT, () => {
			void updateTrayMenu();
		});

		tray.on("mouse-enter", () => {
			void updateTrayMenu();
		});

		console.log("[Tray] Initialized successfully");
	} catch (error) {
		console.error("[Tray] Failed to initialize:", error);
	}
}

/** Rebuild the tray menu + tooltip immediately (e.g. after a settings change). */
export function refreshTray(): void {
	void updateTrayMenu();
}

/** Call on app quit */
export function disposeTray(): void {
	if (tray) {
		tray.destroy();
		tray = null;
	}
}
