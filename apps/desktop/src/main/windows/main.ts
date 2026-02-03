import { join } from "node:path";
import { workspaces, worktrees } from "@superset/local-db";
import { eq } from "drizzle-orm";
import type { BrowserWindow } from "electron";
import { Notification } from "electron";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createAppRouter } from "lib/trpc/routers";
import { localDb } from "main/lib/local-db";
import { NOTIFICATION_EVENTS, PORTS } from "shared/constants";
import { createIPCHandler } from "trpc-electron/main";
import { productName } from "~/package.json";
import { appState } from "../lib/app-state";
import { createApplicationMenu, registerMenuHotkeyUpdates } from "../lib/menu";
import { playNotificationSound } from "../lib/notification-sound";
import {
	type AgentLifecycleEvent,
	notificationsApp,
	notificationsEmitter,
} from "../lib/notifications/server";
import {
	extractWorkspaceIdFromUrl,
	getNotificationTitle,
	getWorkspaceName,
	isPaneVisible,
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

// Current window reference - updated on window create/close
let currentWindow: BrowserWindow | null = null;

// Getter for routers to access current window without stale references
const getWindow = () => currentWindow;

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

	if (ipcHandler) {
		ipcHandler.attachWindow(window);
	} else {
		ipcHandler = createIPCHandler({
			router: createAppRouter(getWindow),
			windows: [window],
		});
	}

	// Start notifications HTTP server
	const server = notificationsApp.listen(
		PORTS.NOTIFICATIONS,
		"127.0.0.1",
		() => {
			console.log(
				`[notifications] Listening on http://127.0.0.1:${PORTS.NOTIFICATIONS}`,
			);
		},
	);

	// Handle agent lifecycle notifications (Stop = completion, PermissionRequest = needs input)
	notificationsEmitter.on(
		NOTIFICATION_EVENTS.AGENT_LIFECYCLE,
		(event: AgentLifecycleEvent) => {
			// Only notify on Stop (completion) and PermissionRequest - not on Start
			if (event.eventType === "Start") return;

			// Skip notification if user is already viewing this pane (Slack pattern)
			if (
				window.isFocused() &&
				event.workspaceId &&
				event.tabId &&
				event.paneId
			) {
				const isVisible = isPaneVisible({
					currentWorkspaceId: extractWorkspaceIdFromUrl(
						window.webContents.getURL(),
					),
					tabsState: appState.data?.tabsState,
					pane: {
						workspaceId: event.workspaceId,
						tabId: event.tabId,
						paneId: event.paneId,
					},
				});
				if (isVisible) return;
			}

			if (!Notification.isSupported()) return;

			const workspaceName = getWorkspaceNameFromDb(event.workspaceId);
			const title = getNotificationTitle({
				tabId: event.tabId,
				paneId: event.paneId,
				tabs: appState.data?.tabsState?.tabs,
				panes: appState.data?.tabsState?.panes,
			});

			const isPermissionRequest = event.eventType === "PermissionRequest";
			const notification = new Notification({
				title: isPermissionRequest
					? `Input Needed — ${workspaceName}`
					: `Agent Complete — ${workspaceName}`,
				body: isPermissionRequest
					? `"${title}" needs your attention`
					: `"${title}" has finished its task`,
				silent: true,
			});

			playNotificationSound();

			notification.on("click", () => {
				window.show();
				window.focus();
				notificationsEmitter.emit(NOTIFICATION_EVENTS.FOCUS_TAB, {
					paneId: event.paneId,
					tabId: event.tabId,
					workspaceId: event.workspaceId,
				});
			});

			notification.show();
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

	window.webContents.on("did-finish-load", async () => {
		console.log("[main-window] Renderer loaded successfully");
		// Restore maximized state if it was saved
		if (initialBounds.isMaximized) {
			window.maximize();
		}
		// Restore zoom level if it was saved
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
		notificationsEmitter.removeAllListeners();
		// Remove terminal listeners to prevent duplicates when window reopens on macOS
		getWorkspaceRuntimeRegistry().getDefault().terminal.detachAllListeners();
		// Detach window from IPC handler (handler stays alive for window reopen)
		ipcHandler?.detachWindow(window);
		// Clear current window reference
		currentWindow = null;
	});

	return window;
}
