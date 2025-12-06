import { join } from "node:path";
import type { BrowserWindow } from "electron";
import { Notification, screen } from "electron";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createAppRouter } from "lib/trpc/routers";
import { PORTS } from "shared/constants";
import { createIPCHandler } from "trpc-electron/main";
import { productName } from "~/package.json";
import { setMainWindow } from "../lib/auto-updater";
import { createApplicationMenu } from "../lib/menu";
import {
	type AgentCompleteEvent,
	notificationsApp,
	notificationsEmitter,
} from "../lib/notifications/server";
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

	// Set main window for auto-updater dialogs
	setMainWindow(window);

	// Create application menu
	createApplicationMenu(window);

	// Update current window reference for router getter
	currentWindow = window;

	// Set up tRPC handler - reuse existing handler on macOS window reopen
	// Router uses getWindow() to always access current window
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

			const notification = new Notification({
				title: isPermissionRequest
					? `Input Needed — ${event.workspaceName}`
					: `Agent Complete — ${event.workspaceName}`,
				body: isPermissionRequest
					? `"${event.tabTitle}" needs your attention`
					: `"${event.tabTitle}" has finished its task`,
				silent: false,
			});

			notification.on("click", () => {
				window.show();
				window.focus();
				// Request focus on the specific tab
				notificationsEmitter.emit("focus-tab", {
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
