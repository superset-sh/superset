import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Get the Desktop storage directory path
 * Default: ~/.superset/desktop/
 * Can be overridden with SUPERSET_DESKTOP_DATA_DIR environment variable
 */
export function getDesktopStorageDir(): string {
	if (process.env.SUPERSET_DESKTOP_DATA_DIR) {
		return process.env.SUPERSET_DESKTOP_DATA_DIR;
	}

	return join(homedir(), ".superset", "desktop");
}

/**
 * Get the Desktop domain database directory
 * Default: ~/.superset/desktop/db/
 */
export function getDesktopDbDir(): string {
	return join(getDesktopStorageDir(), "db");
}

/**
 * Get the Desktop UI storage directory
 * Default: ~/.superset/desktop/ui/
 */
export function getDesktopUiDir(): string {
	return join(getDesktopStorageDir(), "ui");
}

/**
 * Get the Desktop cache directory
 * Default: ~/.superset/desktop/cache/
 */
export function getDesktopCacheDir(): string {
	return join(getDesktopStorageDir(), "cache");
}

/**
 * Get the path to a specific domain collection file
 * Collections are split by file per the plan requirements
 */
export function getDomainCollectionPath(collection: string): string {
	return join(getDesktopDbDir(), `${collection}.json`);
}

/**
 * Get the path to the domain version file
 */
export function getDomainVersionPath(): string {
	return join(getDesktopDbDir(), "db.version");
}

/**
 * Get the path to the UI version file
 */
export function getUiVersionPath(): string {
	return join(getDesktopUiDir(), "ui.version");
}

/**
 * Ensure the Desktop storage directories exist
 * Creates the directory structure if it doesn't exist
 */
export async function ensureDesktopStorageDirs(): Promise<void> {
	const dbDir = getDesktopDbDir();
	const uiDir = getDesktopUiDir();
	const cacheDir = getDesktopCacheDir();

	if (!existsSync(dbDir)) {
		await mkdir(dbDir, { recursive: true, mode: 0o700 });
	}
	if (!existsSync(uiDir)) {
		await mkdir(uiDir, { recursive: true, mode: 0o700 });
	}
	if (!existsSync(cacheDir)) {
		await mkdir(cacheDir, { recursive: true, mode: 0o700 });
	}
}
