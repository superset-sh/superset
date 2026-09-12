import { existsSync } from "node:fs";
import { join } from "node:path";
import { msg } from "@lingui/core/macro";
import { i18n } from "@superset/i18n";
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
import { checkForUpdatesInteractive } from "main/lib/auto-updater";
import {
	getHostServiceCoordinator,
	type HostServiceStatus,
	type HostServiceStatusEvent,
} from "main/lib/host-service-coordinator";
import { menuEmitter } from "main/lib/menu-events";
import { confirmAndQuitCompletely } from "main/lib/quit-completely";

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

/** Host-service run state as the user reads it in the tray, not the wire value. */
function statusLabel(status: HostServiceStatus): string {
	switch (status) {
		case "starting":
			return i18n._(
				msg({
					message: "starting",
				}),
			);
		case "running":
			return i18n._(
				msg({
					message: "running",
				}),
			);
		case "stopped":
			return i18n._(
				msg({
					message: "stopped",
				}),
			);
	}
}

function buildHostServiceSubmenu(
	orgIds: string[],
	infos: Map<string, HostInfo>,
): MenuItemConstructorOptions[] {
	const coordinator = getHostServiceCoordinator();
	const menuItems: MenuItemConstructorOptions[] = [];

	if (orgIds.length === 0) {
		menuItems.push({
			label: i18n._(
				msg({
					message: "No active services",
				}),
			),
			enabled: false,
		});
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
		const label =
			info?.organizationName ??
			i18n._({
				...msg({
					message: "Organization {id}",
				}),
				values: { id: orgId.slice(0, 8) },
			});
		const versionSuffix = info?.version ? ` (v${info.version})` : "";

		menuItems.push({ label, enabled: false });
		menuItems.push({
			label: `  ${statusLabel(status)}${versionSuffix}`,
			enabled: false,
		});
		menuItems.push({
			// Enabled in "stopped" too — that's the state where users most need
			// restart to work (host-service crashed or never came up). Disabled
			// only while a start is in flight, to avoid racing the pending start.
			label: `  ${i18n._(msg({ message: "Restart" }))}`,
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
			label: `  ${i18n._(msg({ message: "Stop" }))}`,
			enabled: isRunning,
			click: () => {
				coordinator.stop(orgId);
				void updateTrayMenu();
			},
		});
	}

	return menuItems;
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
		? i18n._({
				...msg({
					message: "Host Service ({count})",
				}),
				values: { count: orgIds.length },
			})
		: i18n._(msg({ message: "Host Service" }));

	const hostServiceSubmenu = buildHostServiceSubmenu(orgIds, infos);

	const menu = Menu.buildFromTemplate([
		{
			label: hostServiceLabel,
			submenu: hostServiceSubmenu,
		},
		{ type: "separator" },
		{
			label: i18n._(msg({ message: "Open Superset" })),
			click: focusMainWindow,
		},
		{
			label: i18n._(msg({ message: "Settings" })),
			click: openSettings,
		},
		{
			label: i18n._(
				msg({
					message: "Check for Updates",
				}),
			),
			click: () => {
				checkForUpdatesInteractive();
			},
		},
		{ type: "separator" },
		{
			label: i18n._(msg({ message: "Close Superset" })),
			click: () => quitApp(),
		},
		{ type: "separator" },
		{
			label: i18n._(
				msg({
					message: "Quit Superset Completely",
				}),
			),
			click: () => {
				void confirmAndQuitCompletely();
			},
		},
	]);

	tray.setContextMenu(menu);
}

/** Rebuild the tray menu in place (e.g. after the display language changes). */
export function refreshTrayMenu(): void {
	if (!tray) return;
	void updateTrayMenu();
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

		tray.on("mouse-enter", () => {
			void updateTrayMenu();
		});

		console.log("[Tray] Initialized successfully");
	} catch (error) {
		console.error("[Tray] Failed to initialize:", error);
	}
}

/** Call on app quit */
export function disposeTray(): void {
	if (tray) {
		tray.destroy();
		tray = null;
	}
}
