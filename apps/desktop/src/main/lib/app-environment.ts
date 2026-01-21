import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
// SUPERSET_DIR_NAME is workspace-aware for multi-worktree support
import { SUPERSET_DIR_NAME } from "shared/constants";

export const SUPERSET_HOME_DIR = join(homedir(), SUPERSET_DIR_NAME);

export const SUPERSET_HOME_DIR_MODE = 0o700;
export const SUPERSET_SENSITIVE_FILE_MODE = 0o600;

export function ensureSupersetHomeDirExists(): void {
	if (!existsSync(SUPERSET_HOME_DIR)) {
		mkdirSync(SUPERSET_HOME_DIR, {
			recursive: true,
			mode: SUPERSET_HOME_DIR_MODE,
		});
	}

	// Best-effort repair if the directory already existed with weak permissions.
	try {
		chmodSync(SUPERSET_HOME_DIR, SUPERSET_HOME_DIR_MODE);
	} catch (error) {
		console.warn(
			"[app-environment] Failed to chmod Superset home dir (best-effort):",
			SUPERSET_HOME_DIR,
			error,
		);
	}
}

// For lowdb - use our own path instead of app.getPath("userData")
export const APP_STATE_PATH = join(SUPERSET_HOME_DIR, "app-state.json");

// Window geometry state (separate from UI state - main process only, sync I/O)
export const WINDOW_STATE_PATH = join(SUPERSET_HOME_DIR, "window-state.json");
