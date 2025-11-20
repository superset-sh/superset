import path from "node:path";
import { app } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import { registerStorageHandlers } from "./lib/storage-ipcs";
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
app.on("open-url", (event, url) => {
	event.preventDefault();
});

// Register storage IPC handlers
registerStorageHandlers();

// Allow multiple instances - removed single instance lock
(async () => {
	await app.whenReady();

	await makeAppSetup(() => MainWindow());

	// Stop all periodic rescans when app is quitting
	app.on("before-quit", async () => {});
})();
