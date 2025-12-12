import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { Notification, screen } from "electron";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createAppRouter } from "lib/trpc/routers";
import { PORTS } from "shared/constants";
import { createIPCHandler } from "trpc-electron/main";
import { productName } from "~/package.json";
import { appState } from "../lib/app-state";
import { setMainWindow } from "../lib/auto-updater";
import { db } from "../lib/db";
import { createApplicationMenu } from "../lib/menu";
import { playNotificationSound } from "../lib/notification-sound";
import {
	type AgentCompleteEvent,
	notificationsApp,
	notificationsEmitter,
} from "../lib/notifications/server";
import { terminalManager } from "../lib/terminal";

// Singleton IPC handler to prevent duplicate handlers on window reopen (macOS)
let ipcHandler: ReturnType<typeof createIPCHandler> | null = null;

// Current window reference - updated on window create/close
let currentWindow: BrowserWindow | null = null;

// Getter for routers to access current window without stale references
const getWindow = () => currentWindow;

export async function MainWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const window = createWindow({
		id: "main",
		title: productName,
		width,
		height,
		minWidth: 400,
		minHeight: 400,
		show: false,
		center: true,
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

	setMainWindow(window);
	createApplicationMenu();

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

	// Handle agent completion notifications
	notificationsEmitter.on("agent-complete", (event: AgentCompleteEvent) => {
		if (Notification.isSupported()) {
			const isPermissionRequest = event.eventType === "PermissionRequest";

			// Derive workspace name from workspaceId with safe fallbacks
			let workspaceName = "Workspace";
			try {
				const workspaces = db.data?.workspaces;
				const worktrees = db.data?.worktrees;
				if (Array.isArray(workspaces) && Array.isArray(worktrees)) {
					const workspace = workspaces.find((w) => w.id === event.workspaceId);
					const worktree = workspace
						? worktrees.find((wt) => wt.id === workspace.worktreeId)
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
				title = tab?.userTitle?.trim() || tab?.name || pane?.name || "Terminal";
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
				// Request focus on the specific pane
				notificationsEmitter.emit("focus-tab", {
					paneId: event.paneId,
					tabId: event.tabId,
					workspaceId: event.workspaceId,
				});
			});

			notification.show();
		}
	});

	window.webContents.on("did-finish-load", async () => {
		window.show();
	});

	window.on("close", () => {
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
