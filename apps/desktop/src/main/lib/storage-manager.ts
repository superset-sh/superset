import Store from "electron-store";
import { SUPERSET_HOME_DIR } from "./app-environment";

/**
 * Electron store instance for persisting user settings/preferences.
 * Uses a SEPARATE file (settings.json) from app-state.json to avoid conflicts
 * with lowdb which manages app-state.json and reshapes it on startup.
 */
export const store = new Store({
	cwd: SUPERSET_HOME_DIR,
	name: "settings",
});
