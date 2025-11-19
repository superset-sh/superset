import { join } from "node:path";
import { screen } from "electron";
import { createWindow } from "lib/electron-app/factories/windows/create";
import { createAppRouter } from "lib/trpc/routers";
import { createIPCHandler } from "trpc-electron/main";
import { displayName } from "~/package.json";
import { createApplicationMenu } from "../lib/menu";

export async function MainWindow() {
	const { width, height } = screen.getPrimaryDisplay().workAreaSize;

	const window = createWindow({
		id: "main",
		title: displayName,
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

	window.webContents.on("did-finish-load", async () => {
		window.show();
	});

	window.on("close", () => {});

	return window;
}
