import { join } from "node:path";
import { projects } from "@superset/local-db";
import { eq } from "drizzle-orm";
import { BrowserWindow, nativeTheme, screen, shell } from "electron";
import { registerRoute } from "lib/window-loader";
import { localDb } from "main/lib/local-db";
import { windowManager } from "main/lib/window-manager";
import { PLATFORM } from "shared/constants";
import { productName } from "~/package.json";
import { getIpcHandler } from "./main";

/**
 * Creates a project-focused BrowserWindow.
 * Lighter than MainWindow — no notification server, menu rebuilds, or window state persistence.
 */
export async function ProjectWindow(projectId: string): Promise<BrowserWindow> {
	// Resolve project name for the title bar
	let projectName = "Project";
	try {
		const project = localDb
			.select()
			.from(projects)
			.where(eq(projects.id, projectId))
			.get();
		if (project?.name) projectName = project.name;
	} catch {
		// fallback to generic name
	}

	// Offset from main window for cascading effect
	const mainWin = windowManager.getMainWindow();
	let x: number | undefined;
	let y: number | undefined;
	let width = 1200;
	let height = 800;

	if (mainWin && !mainWin.isDestroyed()) {
		const bounds = mainWin.getBounds();
		width = Math.round(bounds.width * 0.8);
		height = Math.round(bounds.height * 0.8);
		x = bounds.x + 30;
		y = bounds.y + 30;

		// Ensure the offset position is still on-screen
		const display = screen.getDisplayNearestPoint({ x, y });
		const { workArea } = display;
		if (x + width > workArea.x + workArea.width) x = workArea.x;
		if (y + height > workArea.y + workArea.height) y = workArea.y;
	}

	const window = new BrowserWindow({
		title: `${productName} — ${projectName}`,
		width,
		height,
		x,
		y,
		minWidth: 400,
		minHeight: 400,
		show: false,
		backgroundColor: nativeTheme.shouldUseDarkColors ? "#252525" : "#ffffff",
		movable: true,
		resizable: true,
		restorable: false,
		alwaysOnTop: false,
		autoHideMenuBar: true,
		frame: false,
		titleBarStyle: "hidden",
		trafficLightPosition: { x: 16, y: 16 },
		webPreferences: {
			preload: join(__dirname, "../preload/index.js"),
			webviewTag: true,
			partition: "persist:superset",
		},
	});

	// Open external URLs in the system browser
	window.webContents.setWindowOpenHandler(({ url }) => {
		if (url.startsWith("http://") || url.startsWith("https://")) {
			shell.openExternal(url);
		}
		return { action: "deny" };
	});

	// Load with projectFocus query param so the renderer filters the sidebar
	registerRoute({
		id: "project",
		browserWindow: window,
		htmlFile: join(__dirname, "../renderer/index.html"),
		query: { projectFocus: projectId },
	});

	// macOS Sequoia+: prevent background throttling corruption
	if (PLATFORM.IS_MAC) {
		window.webContents.setBackgroundThrottling(false);
	}

	// Attach to the singleton IPC handler
	const handler = getIpcHandler();
	if (handler) {
		handler.attachWindow(window);
	}

	// Register with WindowManager
	windowManager.registerProjectWindow(projectId, window);

	window.webContents.once("did-finish-load", () => {
		console.log(`[project-window] Renderer loaded for project: ${projectName}`);
		window.show();
	});

	window.on("close", () => {
		handler?.detachWindow(window);
		windowManager.unregisterProjectWindow(projectId);
	});

	window.on("closed", window.destroy);

	return window;
}
