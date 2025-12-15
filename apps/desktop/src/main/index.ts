import path from "node:path";
import { app, BrowserWindow } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import { PROTOCOL_SCHEME } from "shared/constants";
import { setupAgentHooks } from "./lib/agent-setup";
import { initAppState } from "./lib/app-state";
import { authService, handleAuthDeepLink, isAuthDeepLink } from "./lib/auth";
import { setupAutoUpdater } from "./lib/auto-updater";
import { initDb } from "./lib/db";
import { terminalManager } from "./lib/terminal";
import { MainWindow } from "./windows/main";

// Set different app name for dev to avoid singleton lock conflicts with production
if (process.env.NODE_ENV === "development") {
	app.setName("Superset Dev");
}

// Register protocol handler for deep linking
// In development, we need to provide the execPath and args
if (process.defaultApp) {
	if (process.argv.length >= 2) {
		app.setAsDefaultProtocolClient(PROTOCOL_SCHEME, process.execPath, [
			path.resolve(process.argv[1]),
		]);
	}
} else {
	app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);
}

/**
 * Process a deep link URL for auth
 */
async function processDeepLink(url: string): Promise<void> {
	if (isAuthDeepLink(url)) {
		const result = await handleAuthDeepLink(url);
		if (result.success && result.session) {
			await authService.handleDeepLinkAuth(result.session);
		} else {
			console.error("[main] Auth deep link failed:", result.error);
		}
	}
}

/**
 * Find a deep link URL in argv
 */
function findDeepLinkInArgv(argv: string[]): string | undefined {
	return argv.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
}

/**
 * Focus the main window (show and bring to front)
 */
function focusMainWindow(): void {
	const windows = BrowserWindow.getAllWindows();
	if (windows.length > 0) {
		const mainWindow = windows[0];
		if (mainWindow.isMinimized()) {
			mainWindow.restore();
		}
		mainWindow.show();
		mainWindow.focus();
	}
}

// Handle deep links when app is already running (macOS)
app.on("open-url", async (event, url) => {
	event.preventDefault();
	await processDeepLink(url);
});

// Single instance lock - required for second-instance event on Windows/Linux
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
	// Another instance is already running, quit this one
	app.quit();
} else {
	// Handle deep links when second instance is launched (Windows/Linux)
	app.on("second-instance", async (_event, argv) => {
		focusMainWindow();
		const url = findDeepLinkInArgv(argv);
		if (url) {
			await processDeepLink(url);
		}
	});

	(async () => {
		await app.whenReady();

		await initDb();
		await initAppState();
		await authService.initialize();

		try {
			setupAgentHooks();
		} catch (error) {
			console.error("[main] Failed to set up agent hooks:", error);
			// App can continue without agent hooks, but log the failure
		}

		await makeAppSetup(() => MainWindow());
		setupAutoUpdater();

		// Handle cold-start deep links (Windows/Linux - app launched via deep link)
		const coldStartUrl = findDeepLinkInArgv(process.argv);
		if (coldStartUrl) {
			await processDeepLink(coldStartUrl);
		}

		// Clean up all terminals when app is quitting
		app.on("before-quit", async () => {
			await terminalManager.cleanup();
		});
	})();
}
