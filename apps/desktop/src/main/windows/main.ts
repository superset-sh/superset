import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { Notification, screen } from "electron";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createAppRouter } from "lib/trpc/routers";
import { PORTS } from "shared/constants";
import { createIPCHandler } from "trpc-electron/main";
import { productName } from "~/package.json";
import { setMainWindow } from "../lib/auto-updater";
import { db } from "../lib/db";
import { createApplicationMenu } from "../lib/menu";
import { playNotificationSound } from "../lib/notification-sound";
import {
	type AgentCompleteEvent,
	notificationsApp,
	notificationsEmitter,
} from "../lib/notifications/server";
import { store } from "../lib/storage-manager";
import { terminalManager } from "../lib/terminal-manager";

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

			// Derive workspace name from workspaceId
			const workspace = db.data.workspaces.find(
				(w) => w.id === event.workspaceId,
			);
			const worktree = workspace
				? db.data.worktrees.find((wt) => wt.id === workspace.worktreeId)
				: undefined;
			const workspaceName = workspace?.name || worktree?.branch || "Workspace";

			// Derive title from pane name, falling back to tab name
			const { paneId } = event;
			const tabsStorage = store.get("tabs-storage") as
				| {
						state?: {
							panes?: Record<string, { tabId: string; name?: string }>;
							tabs?: Array<{ id: string; userTitle?: string; name: string }>;
						};
				  }
				| undefined;
			const pane = tabsStorage?.state?.panes?.[paneId];
			const tab = pane
				? tabsStorage?.state?.tabs?.find((t) => t.id === pane.tabId)
				: undefined;
			const title =
				pane?.name || tab?.userTitle?.trim() || tab?.name || "Terminal";

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
