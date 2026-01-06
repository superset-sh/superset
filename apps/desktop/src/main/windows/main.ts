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
import { terminalManager } from "../lib/terminal";
import {
	getInitialWindowBounds,
	loadWindowState,
	saveWindowState,
} from "../lib/window-state";

// Singleton IPC handler to prevent duplicate handlers on window reopen (macOS)
let ipcHandler: ReturnType<typeof createIPCHandler> | null = null;

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

			if (Notification.isSupported()) {
				const isPermissionRequest = event.eventType === "PermissionRequest";

				// Derive workspace name from workspaceId with safe fallbacks
				let workspaceName = "Workspace";
				try {
					if (event.workspaceId) {
						const workspace = localDb
							.select()
							.from(workspaces)
							.where(eq(workspaces.id, event.workspaceId))
							.get();
						const worktree = workspace?.worktreeId
							? localDb
									.select()
									.from(worktrees)
									.where(eq(worktrees.id, workspace.worktreeId))
									.get()
							: undefined;
						workspaceName = workspace?.name || worktree?.branch || "Workspace";
					}
				} catch (error) {
					console.error(
						"[notifications] Failed to access db for workspace name:",
						error,
					);
				}

				// Derive title from tab name, falling back to pane name
				// Priority: tab.userTitle (user-set name) > tab.name (auto-generated) > pane.name > "Terminal"
				let title = "Terminal";
				try {
					const { paneId, tabId } = event;
					const tabsState = appState.data?.tabsState;
					const pane = paneId ? tabsState?.panes?.[paneId] : undefined;
					const tab = tabId
						? tabsState?.tabs?.find((t) => t.id === tabId)
						: undefined;
					title =
						tab?.userTitle?.trim() || tab?.name || pane?.name || "Terminal";
				} catch (error) {
					console.error(
						"[notifications] Failed to access appState for tab title:",
						error,
					);
				}

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
			}
		},
	);

	window.webContents.on("did-finish-load", async () => {
		// Restore maximized state if it was saved
		if (initialBounds.isMaximized) {
			window.maximize();
		}
		window.show();
	});

	window.on("close", () => {
		// Save window state first, before any cleanup
		const isMaximized = window.isMaximized();
		const bounds = isMaximized ? window.getNormalBounds() : window.getBounds();
		saveWindowState({
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
			isMaximized,
		});

		server.close();
		notificationsEmitter.removeAllListeners();
		// Remove terminal listeners to prevent duplicates when window reopens on macOS
		terminalManager.detachAllListeners();
		// Detach window from IPC handler (handler stays alive for window reopen)
		ipcHandler?.detachWindow(window);
		// Clear current window reference
		currentWindow = null;
	});

	return window;
}
