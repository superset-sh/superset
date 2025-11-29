import path from "node:path";
import { app } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import { setupAgentHooks } from "./lib/agent-setup";
import { initDb } from "./lib/db";
import { registerStorageHandlers } from "./lib/storage-ipcs";
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

// TODO: Handle deep link when app is already running
app.on("open-url", (event, _url) => {
	event.preventDefault();
});

registerStorageHandlers();

// Allow multiple instances - removed single instance lock
(async () => {
	await app.whenReady();

	await initDb();

	try {
		setupAgentHooks();
	} catch (error) {
		console.error("[main] Failed to set up agent hooks:", error);
		// App can continue without agent hooks, but log the failure
	}

	await makeAppSetup(() => MainWindow());

	// Clean up all terminals when app is quitting
	// Use a flag to prevent infinite loop since we call app.quit() after cleanup
	let isCleaningUp = false;
	app.on("before-quit", (event) => {
		if (isCleaningUp) {
			return; // Already cleaning up, allow quit to proceed
		}

		// Prevent the quit until cleanup is complete
		event.preventDefault();
		isCleaningUp = true;

		terminalManager
			.cleanup()
			.catch((error) => {
				console.error("[main] Terminal cleanup failed:", error);
			})
			.finally(() => {
				// Now actually quit
				app.quit();
			});
	});
})();
