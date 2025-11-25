import { join } from "node:path";
import { Notification, screen } from "electron";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createAppRouter } from "lib/trpc/routers";
import { createIPCHandler } from "trpc-electron/main";
import { productName } from "~/package.json";
import { createApplicationMenu } from "../lib/menu";
import {
	type AgentCompleteEvent,
	NOTIFICATIONS_PORT,
	notificationsApp,
	notificationsEmitter,
} from "../lib/notifications/server";

export async function MainWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const window = createWindow({
		id: "main",
		title: productName,
		width,
		height,
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

	// Create application menu
	createApplicationMenu(window);

	// Set up tRPC handler
	createIPCHandler({
		router: createAppRouter(window),
		windows: [window],
	});

	// Start notifications HTTP server
	const server = notificationsApp.listen(
		NOTIFICATIONS_PORT,
		"127.0.0.1",
		() => {
			console.log(
				`[notifications] Listening on http://127.0.0.1:${NOTIFICATIONS_PORT}`,
			);
		},
	);

	// Handle agent completion notifications
	notificationsEmitter.on("agent-complete", (event: AgentCompleteEvent) => {
		if (Notification.isSupported()) {
			const notification = new Notification({
				title: `Agent Complete — ${event.workspaceName}`,
				body: `"${event.tabTitle}" has finished its task`,
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
	});

	return window;
}
