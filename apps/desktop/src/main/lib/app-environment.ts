import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { SUPERSET_DIR_NAME } from "shared/constants";

const DEV_DATA_DIR_NAME = "superset-dev-data";
const SUPERSET_HOME_DIR_ENV = "SUPERSET_HOME_DIR";

function findWorktreeRoot(startDir: string): string | null {
	let currentDir = startDir;

	while (true) {
		if (existsSync(join(currentDir, ".git"))) {
			return currentDir;
		}

		const parentDir = dirname(currentDir);
		if (parentDir === currentDir) {
			return null;
		}

		currentDir = parentDir;
	}
}

function resolveSupersetHomeDir(): string {
	const envSupersetHomeDir = process.env[SUPERSET_HOME_DIR_ENV];
	if (envSupersetHomeDir) {
		return envSupersetHomeDir;
	}

	if (process.env.NODE_ENV === "development") {
		const worktreeRoot = findWorktreeRoot(process.cwd());
		return join(worktreeRoot ?? process.cwd(), DEV_DATA_DIR_NAME);
	}

	return join(homedir(), SUPERSET_DIR_NAME);
}

export const SUPERSET_HOME_DIR = resolveSupersetHomeDir();
process.env[SUPERSET_HOME_DIR_ENV] = SUPERSET_HOME_DIR;

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
