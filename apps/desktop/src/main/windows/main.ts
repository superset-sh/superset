import { join } from "node:path";
import { workspaces, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import type { BrowserWindow } from "electron";
import { app, Notification, nativeTheme } from "electron";
import log from "electron-log/main";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createTrpcContext } from "lib/trpc/context";
import { createAppRouter } from "lib/trpc/routers";
import { localDb } from "main/lib/local-db";
import { NOTIFICATION_EVENTS, PLATFORM } from "shared/constants";
import {
	env,
	getWorkspaceName as getEnvWorkspaceName,
} from "shared/env.shared";
import type { AgentLifecycleEvent } from "shared/notification-types";
import { createIPCHandler } from "trpc-electron/main";
import { productName } from "~/package.json";
import { appState } from "../lib/app-state";
import { browserManager } from "../lib/browser/browser-manager";
import { createApplicationMenu } from "../lib/menu";
import { menuEmitter } from "../lib/menu-events";
import { playNotificationSound } from "../lib/notification-sound";
import { NotificationManager } from "../lib/notifications/notification-manager";
import {
	notificationsApp,
	notificationsEmitter,
} from "../lib/notifications/server";
import {
	extractWorkspaceIdFromUrl,
	getNotificationTitle,
	getWorkspaceName,
} from "../lib/notifications/utils";
import {
	getAllWindows,
	getFocusedOrLastWindow,
	getOrg,
	markFocused,
	registerWindow,
	unregisterWindow,
} from "../lib/window-registry/window-registry";
import {
	getInitialWindowBounds,
	loadWindowState,
	saveWindowState,
	type WindowState,
} from "../lib/window-state";
import { getWorkspaceRuntimeRegistry } from "../lib/workspace-runtime";

// Singleton IPC handler — created once, shared by every window. Each window is
// attached/detached individually via attachWindow/detachWindow.
let ipcHandler: ReturnType<typeof createIPCHandler> | null = null;

// Routers receive this getter so they always act on the currently relevant
// window. With multi-window support that is the most-recently-focused window
// (tracked by the window registry) rather than a single stored reference.
const getWindow = (): BrowserWindow | null => getFocusedOrLastWindow();

function getWorkspaceNameFromDb(workspaceId: string | undefined): string {
	if (!workspaceId) return "Workspace";
	try {
		const workspace = localDb
			.select()
			.from(workspaces)
			.where(eq(workspaces.id, workspaceId))
			.get();
		const worktree = workspace?.worktreeId
			? localDb
					.select()
					.from(worktrees)
					.where(eq(worktrees.id, workspace.worktreeId))
					.get()
			: undefined;
		return getWorkspaceName({ workspace, worktree });
	} catch (error) {
		console.error("[notifications] Failed to get workspace name:", error);
		return "Workspace";
	}
}

// invalidate() alone may not rebuild corrupted GPU layers — a tiny resize
// forces Chromium to reconstruct the compositor layer tree.
const forceRepaint = (win: BrowserWindow) => {
	if (win.isDestroyed()) return;
	win.webContents.invalidate();
	if (win.isMaximized() || win.isFullScreen()) return;
	const [width, height] = win.getSize();
	win.setSize(width + 1, height);
	setTimeout(() => {
		if (!win.isDestroyed()) win.setSize(width, height);
	}, 32);
};

// GPU process restarts don't repaint existing compositor layers automatically.
app.on("child-process-gone", (_event, details) => {
	if (details.type === "GPU") {
		console.warn("[main-window] GPU process gone:", details.reason);
		const win = getWindow();
		if (win) forceRepaint(win);
	}
});

// ---------------------------------------------------------------------------
// App-level services
// ---------------------------------------------------------------------------
// These exist once for the whole app, independent of how many windows are open.
// Splitting them out of per-window setup is what makes opening a second window
// safe: the notifications HTTP server binds a single fixed port and the
// terminal/notification listeners must not be registered more than once.

let appServicesInitialized = false;

/**
 * Initialize app-wide singletons (the tRPC IPC handler and the application
 * menu). Idempotent — safe to call before each window is created.
 */
export function initAppServices(): void {
	if (appServicesInitialized) return;
	appServicesInitialized = true;
	ipcHandler = createIPCHandler({
		createContext: createTrpcContext,
		router: createAppRouter(getWindow),
		windows: [],
	});
	createApplicationMenu();

	// File → New Window (Cmd+N): open another window on the same org as the
	// currently focused window. Per-window org independence arrives in a later
	// milestone; for now a new window mirrors the current org.
	menuEmitter.on("new-window", () => {
		const focused = getFocusedOrLastWindow();
		const orgId = focused ? getOrg(focused.id) : null;
		void createPlatformWindow({ orgId });
	});
}

// Shared services that should run while at least one window is open. Started
// when the first window opens and torn down when the last window closes, so
// they are never double-initialized by additional windows.
let notificationsServer: ReturnType<typeof notificationsApp.listen> | null =
	null;
let notificationManager: NotificationManager | null = null;
let agentLifecycleHandler: ((event: AgentLifecycleEvent) => void) | null = null;

function startSharedServices(): void {
	if (notificationManager) return;

	notificationsServer = notificationsApp.listen(
		env.DESKTOP_NOTIFICATIONS_PORT,
		"127.0.0.1",
		() => {
			console.log(
				`[notifications] Listening on http://127.0.0.1:${env.DESKTOP_NOTIFICATIONS_PORT}`,
			);
		},
	);

	notificationManager = new NotificationManager({
		isSupported: () => Notification.isSupported(),
		createNotification: (opts) => new Notification(opts),
		playSound: playNotificationSound,
		onNotificationClick: (ids) => {
			const win = getFocusedOrLastWindow();
			win?.show();
			win?.focus();
			if (ids.workspaceId && ids.terminalId) {
				notificationsEmitter.emit(
					NOTIFICATION_EVENTS.FOCUS_V2_NOTIFICATION_SOURCE,
					{
						workspaceId: ids.workspaceId,
						source: { type: "terminal", id: ids.terminalId },
					},
				);
				return;
			}
			notificationsEmitter.emit(NOTIFICATION_EVENTS.FOCUS_TAB, ids);
		},
		getVisibilityContext: () => {
			const win = getFocusedOrLastWindow();
			return {
				isFocused: win?.isFocused() ?? false,
				currentWorkspaceId: win
					? extractWorkspaceIdFromUrl(win.webContents.getURL())
					: null,
				tabsState: appState.data?.tabsState,
			};
		},
		getWorkspaceName: getWorkspaceNameFromDb,
		getNotificationTitle: (event) =>
			getNotificationTitle({
				tabId: event.tabId,
				paneId: event.paneId,
				tabs: appState.data?.tabsState?.tabs,
				panes: appState.data?.tabsState?.panes,
			}),
	});
	notificationManager.start();

	agentLifecycleHandler = (event: AgentLifecycleEvent) => {
		notificationManager?.handleAgentLifecycle(event);
	};
	notificationsEmitter.on(
		NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
		agentLifecycleHandler,
	);

	// Forward low-volume terminal lifecycle events to the renderer via the
	// existing notifications subscription. Used only for correctness (e.g.
	// clearing stuck agent lifecycle statuses when terminal panes aren't
	// mounted).
	getWorkspaceRuntimeRegistry()
		.getDefault()
		.terminal.on(
			"terminalExit",
			(event: {
				paneId: string;
				exitCode: number;
				signal?: number;
				reason?: "killed" | "exited" | "error";
			}) => {
				notificationsEmitter.emit(NOTIFICATION_EVENTS.TERMINAL_EXIT, {
					paneId: event.paneId,
					exitCode: event.exitCode,
					signal: event.signal,
					reason: event.reason,
				});
			},
		);
}

function stopSharedServices(): void {
	browserManager.unregisterAll();
	notificationsServer?.close();
	notificationsServer = null;
	notificationManager?.dispose();
	notificationManager = null;
	agentLifecycleHandler = null;
	notificationsEmitter.removeAllListeners();
	getWorkspaceRuntimeRegistry().getDefault().terminal.detachAllListeners();
}

// ---------------------------------------------------------------------------
// Per-window setup
// ---------------------------------------------------------------------------

/**
 * Create one platform window. Safe to call multiple times — each call builds an
 * independent BrowserWindow, registers it in the window registry, and attaches
 * it to the shared IPC handler. The first window starts shared services; the
 * last window to close stops them.
 *
 * @param orgId  The organization this window should show. Consumed by the
 *               per-window organization context (Milestone 2); may be null
 *               until the renderer resolves a default.
 * @param bounds Optional saved bounds to restore (used by window restore).
 */
export async function createPlatformWindow({
	orgId,
	bounds,
}: {
	orgId: string | null;
	bounds?: WindowState;
}): Promise<BrowserWindow> {
	initAppServices();

	const wasEmpty = getAllWindows().length === 0;

	const savedWindowState = bounds ?? loadWindowState();
	const initialBounds = getInitialWindowBounds(savedWindowState);
	let persistedZoomLevel = savedWindowState?.zoomLevel;

	const isDev = env.NODE_ENV === "development";
	const workspaceName = isDev ? getEnvWorkspaceName() : undefined;
	const windowTitle = workspaceName
		? `${productName} — ${workspaceName}`
		: productName;

	const window = createWindow({
		id: "main",
		title: windowTitle,
		width: initialBounds.width,
		height: initialBounds.height,
		x: initialBounds.x,
		y: initialBounds.y,
		minWidth: 400,
		minHeight: 400,
		show: false,
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#252525" : "#ffffff",
		center: initialBounds.center,
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
			// Isolate Electron session from system browser cookies
			// This ensures desktop uses bearer token auth, not web cookies
			partition: "persist:superset",
		},
	});

	registerWindow({ window, orgId });
	window.on("focus", () => markFocused(window.id));

	if (wasEmpty) {
		startSharedServices();
	}

	// macOS Sequoia+: background throttling can corrupt GPU compositor layers
	if (PLATFORM.IS_MAC) {
		window.webContents.setBackgroundThrottling(false);
	}

	if (isDev) {
		window.webContents.on(
			"console-message",
			(_event, level, message, line, sourceId) => {
				const shouldForward =
					level >= 2 ||
					message.includes("[stress]") ||
					message.includes("[main]");
				if (!shouldForward) return;

				const details = sourceId ? ` (${sourceId}:${line})` : "";
				const formatted = `[renderer-console] ${message}${details}`;
				if (level >= 3) {
					log.error(formatted);
				} else if (level >= 2) {
					log.warn(formatted);
				} else {
					log.info(formatted);
				}
			},
		);

		window.on("unresponsive", () => {
			log.warn("[main-window] Renderer became unresponsive", {
				url: window.webContents.getURL(),
			});
		});
		window.on("responsive", () => {
			log.info("[main-window] Renderer became responsive", {
				url: window.webContents.getURL(),
			});
		});
	}

	ipcHandler?.attachWindow(window);

	// macOS Sequoia+: occluded/minimized windows can lose compositor layers
	if (PLATFORM.IS_MAC) {
		window.on("restore", () => {
			window.webContents.invalidate();
		});
		window.on("show", () => {
			window.webContents.invalidate();
		});
	}

	// Persist window bounds on move/resize so state survives app.exit(0)
	// (which skips the close handler — e.g. electron-vite SIGTERM during dev).
	// Gated by `initialized` so the initial maximize() doesn't immediately
	// write isMaximized: true back to disk before the user touches the window.
	let initialized = false;
	let hasCompletedFirstLoad = false;
	let saveTimeout: ReturnType<typeof setTimeout> | null = null;
	const debouncedSave = () => {
		if (!initialized || window.isDestroyed()) return;
		if (saveTimeout) clearTimeout(saveTimeout);
		saveTimeout = setTimeout(() => {
			if (window.isDestroyed()) return;
			const isMaximized = window.isMaximized();
			const bounds = isMaximized
				? window.getNormalBounds()
				: window.getBounds();
			const zoomLevel = window.webContents.getZoomLevel();
			saveWindowState({
				x: bounds.x,
				y: bounds.y,
				width: bounds.width,
				height: bounds.height,
				isMaximized,
				zoomLevel,
			});
			persistedZoomLevel = zoomLevel;
		}, 500);
	};
	window.on("move", debouncedSave);
	window.on("resize", debouncedSave);
	window.webContents.on("zoom-changed", () => {
		setTimeout(() => {
			if (window.isDestroyed()) return;
			persistedZoomLevel = window.webContents.getZoomLevel();
			debouncedSave();
		}, 0);
	});

	window.webContents.on("did-finish-load", () => {
		console.log("[main-window] Renderer loaded successfully");

		if (persistedZoomLevel !== undefined) {
			window.webContents.setZoomLevel(persistedZoomLevel);
		}

		if (!hasCompletedFirstLoad) {
			if (initialBounds.isMaximized) {
				window.maximize();
			}
			window.show();
			initialized = true;
			hasCompletedFirstLoad = true;
		}
	});

	window.webContents.on(
		"did-fail-load",
		(_event, errorCode, errorDescription, validatedURL) => {
			console.error("[main-window] Failed to load renderer:");
			console.error(`  Error code: ${errorCode}`);
			console.error(`  Description: ${errorDescription}`);
			console.error(`  URL: ${validatedURL}`);
			// Show the window anyway so user can see something is wrong
			window.show();
		},
	);

	window.webContents.on("render-process-gone", (_event, details) => {
		console.error("[main-window] Renderer process gone:", details);
		log.error("[main-window] Renderer process gone", details);
	});

	window.webContents.on("preload-error", (_event, preloadPath, error) => {
		console.error("[main-window] Preload script error:");
		console.error(`  Path: ${preloadPath}`);
		console.error(`  Error:`, error);
	});

	window.on("close", () => {
		// Save window state first, before any cleanup
		const isMaximized = window.isMaximized();
		const bounds = isMaximized ? window.getNormalBounds() : window.getBounds();
		const zoomLevel = window.webContents.getZoomLevel();
		saveWindowState({
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			isMaximized,
			zoomLevel,
		});
		persistedZoomLevel = zoomLevel;

		ipcHandler?.detachWindow(window);
		unregisterWindow(window.id);

		// Tear down app-wide shared services only when the last window closes.
		if (getAllWindows().length === 0) {
			stopSharedServices();
		}
	});

	return window;
}
