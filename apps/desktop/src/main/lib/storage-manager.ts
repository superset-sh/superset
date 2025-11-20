import Store from "electron-store";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Electron store instance for persisting application state
 * Stores data in ~/.superset/app-state.json
 */
export const store = new Store({
	cwd: join(homedir(), ".superset"),
	name: "app-state",
});
