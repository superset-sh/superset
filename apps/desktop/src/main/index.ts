// Load .env from monorepo root before any other imports
import { resolve } from "node:path";
import { config } from "dotenv";

// Use override: true to ensure .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../../../.env"), override: true });

import { app } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import { getPort } from "main/lib/port-manager";
import { MainWindow } from "./windows/main";

// Allow multiple instances - removed single instance lock
// Each instance will use the same default user data directory
// To use separate data directories, launch with: --user-data-dir=/path/to/custom/dir
(async () => {
	// Initialize port selection before app starts
	// This ensures we get a consistent available port for this workspace
	const port = await getPort();
	console.log(`Using dev server port: ${port}`);

	await app.whenReady();
	await makeAppSetup(MainWindow);
})();
