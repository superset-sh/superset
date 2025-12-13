// Load environment variables from .env file BEFORE any other imports
// This ensures Auth0 credentials are available at runtime (not compile-time)
// Use override: true to ensure .env values take precedence over inherited env vars
import path from "node:path";
import { config } from "dotenv";

config({
	path: path.resolve(__dirname, "../../../../.env"),
	override: true,
});

import { app } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import { setupAgentHooks } from "./lib/agent-setup";
import { initAppState } from "./lib/app-state";
import { authManager, registerAuthHandlers } from "./lib/auth";
import { setupAutoUpdater } from "./lib/auto-updater";
import { initDb } from "./lib/db";
import { terminalManager } from "./lib/terminal";
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

// Handle deep links (including OAuth callbacks)
app.on("open-url", (event, url) => {
	event.preventDefault();
	console.log("[main] Received deep link:", url);

	// Handle Auth0 OAuth callback
	if (url.startsWith("superset://auth/callback")) {
		authManager.handleCallback(url);
		return;
	}

	// Other deep link handling can be added here
});

registerAuthHandlers();

// Allow multiple instances - removed single instance lock
(async () => {
	await app.whenReady();

	await initDb();
	await initAppState();
	// Validate auth session on startup
	await authManager.validateSessionOnStartup();

	try {
		setupAgentHooks();
	} catch (error) {
		console.error("[main] Failed to set up agent hooks:", error);
		// App can continue without agent hooks, but log the failure
	}

	await makeAppSetup(() => MainWindow());
	setupAutoUpdater();

	// Clean up when app is quitting
	app.on("before-quit", async () => {
		authManager.stopRefreshInterval();
		await terminalManager.cleanup();
	});
})();
