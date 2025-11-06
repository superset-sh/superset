// Load .env from monorepo root before any other imports
import { resolve } from "node:path";
import { config } from "dotenv";

// Use override: true to ensure .env values take precedence over inherited env vars
config({ path: resolve(__dirname, "../../../../.env"), override: true });

import { app } from "electron";
import { makeAppSetup } from "lib/electron-app/factories/app/setup";
import { MainWindow } from "./windows/main";

// Allow multiple instances - removed single instance lock
// Each instance will use the same default user data directory
// To use separate data directories, launch with: --user-data-dir=/path/to/custom/dir
(async () => {
	await app.whenReady();
	await makeAppSetup(MainWindow);
})();
