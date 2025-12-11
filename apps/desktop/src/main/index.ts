import path from "node:path";
import { app } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import { setupAgentHooks } from "./lib/agent-setup";
import { initAppState } from "./lib/app-state";
import { authManager, registerAuthHandlers } from "./lib/auth";
import { setupAutoUpdater } from "./lib/auto-updater";
import { initDb } from "./lib/db";
import { terminalManager } from "./lib/terminal-manager";
import { MainWindow } from "./windows/main";

// Protocol scheme for deep linking
const PROTOCOL_SCHEME = "superset";

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

<<<<<<< HEAD
// Handle deep links
app.on("open-url", (event, url) => {
	event.preventDefault();
	console.log("[main] Received deep link:", url);
	// Deep link handling can be added here for future features
	// Auth uses BrowserWindow popup approach, not deep links
});

registerAuthHandlers();

// Allow multiple instances - removed single instance lock
(async () => {
	await app.whenReady();

	await initDb();
	await initAppState();
	// Validate auth session against Clerk cookies
	await authManager.validateSessionOnStartup();

	try {
		setupAgentHooks();
	} catch (error) {
		console.error("[main] Failed to set up agent hooks:", error);
		// App can continue without agent hooks, but log the failure
	}

	await makeAppSetup(() => MainWindow());
	setupAutoUpdater();

	// Clean up all terminals when app is quitting
	app.on("before-quit", async () => {
		authManager.stopRefreshInterval();
		await terminalManager.cleanup();
	});
})();
