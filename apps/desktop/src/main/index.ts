// Load .env from monorepo root before any other imports
import { resolve } from "node:path";
import { config } from "dotenv";

// Use override: true to ensure .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../../../.env"), override: true });

import path from "node:path";
import { app } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import { registerDeepLinkIpcs } from "main/lib/deep-link-ipcs";
import { deepLinkManager } from "main/lib/deep-link-manager";
import { registerPortIpcs } from "main/lib/port-ipcs";
import { getPort } from "main/lib/port-manager";
import windowManager from "main/lib/window-manager";
import { registerWorkspaceIPCs } from "main/lib/workspace-ipcs";

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

// macOS: Handle deep link when app is already running
app.on("open-url", (event, url) => {
	event.preventDefault();
	deepLinkManager.setUrl(url);
});

// Allow multiple instances - removed single instance lock
// Each instance will use the same default user data directory
// To use separate data directories, launch with: --user-data-dir=/path/to/custom/dir
(async () => {
	// Initialize port selection before app starts
	// This ensures we get a consistent available port for this workspace
	const port = await getPort();

	await app.whenReady();

	// Register IPC handlers once at startup (not per-window)
	registerWorkspaceIPCs();
	registerPortIpcs();
	registerDeepLinkIpcs();

	await makeAppSetup(() => windowManager.createWindow());
})();
