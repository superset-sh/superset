import Store from "electron-store";
import { SUPERSET_HOME_DIR } from "./app-environment";

/**
 * Electron store instance for persisting application state
 * Stores data in ~/.superset/app-state.json (prod) or ~/.superset-dev/app-state.json (dev)
 */
export const store = new Store({
	cwd: SUPERSET_HOME_DIR,
	name: "app-state",
});
