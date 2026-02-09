import { join } from "node:path";
import { workspaces, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import type { BrowserWindow } from "electron";
import { app, Notification, nativeTheme } from "electron";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createAppRouter } from "lib/trpc/routers";
import { localDb } from "main/lib/local-db";
import { NOTIFICATION_EVENTS, PLATFORM, PORTS } from "shared/constants";
import type { AgentLifecycleEvent } from "shared/notification-types";
import { createIPCHandler } from "trpc-electron/main";
import { productName } from "~/package.json";
import { appState } from "../lib/app-state";
import { createApplicationMenu, registerMenuHotkeyUpdates } from "../lib/menu";
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
	getInitialWindowBounds,
	loadWindowState,
	saveWindowState,
} from "../lib/window-state";
import { getWorkspaceRuntimeRegistry } from "../lib/workspace-runtime";

// Singleton IPC handler to prevent duplicate handlers on window reopen (macOS)
let ipcHandler: ReturnType<typeof createIPCHandler> | null = null;

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

let currentWindow: BrowserWindow | null = null;

// Routers receive this getter so they always see the current window, not a stale reference
const getWindow = () => currentWindow;

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

export async function MainWindow() {
	const savedWindowState = loadWindowState();
	const initialBounds = getInitialWindowBounds(savedWindowState);

	const window = createWindow({
		id: "main",
		title: productName,
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

	createApplicationMenu();
	registerMenuHotkeyUpdates();

	currentWindow = window;

	// macOS Sequoia+: background throttling can corrupt GPU compositor layers
	if (PLATFORM.IS_MAC) {
		window.webContents.setBackgroundThrottling(false);
	}

	if (ipcHandler) {
		ipcHandler.attachWindow(window);
	} else {
		ipcHandler = createIPCHandler({
			router: createAppRouter(getWindow),
			windows: [window],
		});
	}

	const server = notificationsApp.listen(
		PORTS.NOTIFICATIONS,
		"127.0.0.1",
		() => {
			console.log(
				`[notifications] Listening on http://127.0.0.1:${PORTS.NOTIFICATIONS}`,
			);
		},
	);

	const notificationManager = new NotificationManager({
		isSupported: () => Notification.isSupported(),
		createNotification: (opts) => new Notification(opts),
		playSound: playNotificationSound,
		onNotificationClick: (ids) => {
			window.show();
			window.focus();
			notificationsEmitter.emit(NOTIFICATION_EVENTS.FOCUS_TAB, ids);
		},
		getVisibilityContext: () => ({
			isFocused: window.isFocused(),
			currentWorkspaceId: extractWorkspaceIdFromUrl(
				window.webContents.getURL(),
			),
			tabsState: appState.data?.tabsState,
		}),
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

	notificationsEmitter.on(
		NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
		(event: AgentLifecycleEvent) => {
			notificationManager.handleAgentLifecycle(event);
		},
	);

	// Forward low-volume terminal lifecycle events to the renderer via the existing
	// notifications subscription. This is used only for correctness (e.g. clearing
	// stuck agent lifecycle statuses when terminal panes aren't mounted).
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

	// macOS Sequoia+: occluded/minimized windows can lose compositor layers
	if (PLATFORM.IS_MAC) {
		window.on("restore", () => {
			window.webContents.invalidate();
		});
		window.on("show", () => {
			window.webContents.invalidate();
		});
	}

	window.webContents.on("did-finish-load", async () => {
		console.log("[main-window] Renderer loaded successfully");
		if (initialBounds.isMaximized) {
			window.maximize();
		}
		if (savedWindowState?.zoomLevel !== undefined) {
			window.webContents.setZoomLevel(savedWindowState.zoomLevel);
		}
		window.show();
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

		server.close();
		notificationManager.dispose();
		notificationsEmitter.removeAllListeners();
		// Remove terminal listeners to prevent duplicates when window reopens on macOS
		getWorkspaceRuntimeRegistry().getDefault().terminal.detachAllListeners();
		// Detach window from IPC handler (handler stays alive for window reopen)
		ipcHandler?.detachWindow(window);
		currentWindow = null;
	});

	return window;
}
