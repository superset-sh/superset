import {
	chmodSync,
	existsSync,
	mkdirSync,
	rmSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { SUPERSET_DIR_NAME } from "shared/constants";

const SUPERSET_HOME_DIR_ENV = "SUPERSET_HOME_DIR";
const PATCHED_BROWSER_STATE_MARKER = ".patched-browser-state-reset-v1";
const PATCHED_BROWSER_STATE_PATHS = [
	"Cache",
	"Code Cache",
	"blob_storage",
	"Local Storage",
	"Partitions",
	"Shared Dictionary",
	"SharedStorage",
	"Trust Tokens",
	"Trust Tokens-journal",
	"Network Persistent State",
	"Preferences",
] as const;

function getDefaultSupersetHomeDir(): string {
	if (process.execPath.includes("Superset Patched.app")) {
		return join(homedir(), ".superset-patched");
	}
	return join(homedir(), SUPERSET_DIR_NAME);
}

export const SUPERSET_HOME_DIR =
	process.env[SUPERSET_HOME_DIR_ENV] || getDefaultSupersetHomeDir();
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

export function isPatchedDesktopBuild(
	execPath: string = process.execPath,
): boolean {
	return execPath.includes("Superset Patched.app");
}

export function resetPatchedBrowserStateIfNeeded(
	homeDir: string = SUPERSET_HOME_DIR,
	execPath: string = process.execPath,
): void {
	if (!isPatchedDesktopBuild(execPath)) return;

	const markerPath = join(homeDir, PATCHED_BROWSER_STATE_MARKER);
	if (existsSync(markerPath)) return;

	ensureSupersetHomeDirExists();

	for (const relativePath of PATCHED_BROWSER_STATE_PATHS) {
		const targetPath = join(homeDir, relativePath);
		if (!existsSync(targetPath)) continue;
		try {
			rmSync(targetPath, { recursive: true, force: true });
		} catch {
			try {
				unlinkSync(targetPath);
			} catch (error) {
				console.warn(
					"[app-environment] Failed to reset patched browser state:",
					targetPath,
					error,
				);
			}
		}
	}

	try {
		writeFileSync(markerPath, `${new Date().toISOString()}\n`, "utf8");
	} catch (error) {
		console.warn(
			"[app-environment] Failed to write patched browser state marker:",
			markerPath,
			error,
		);
	}
}

// For lowdb - use our own path instead of app.getPath("userData")
export const APP_STATE_PATH = join(SUPERSET_HOME_DIR, "app-state.json");

// Window geometry state (separate from UI state - main process only, sync I/O)
export const WINDOW_STATE_PATH = join(SUPERSET_HOME_DIR, "window-state.json");
