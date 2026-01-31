import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Get the storage directory path
 * Default: ~/.superset/cli/
 * Can be overridden with SUPERSET_CLI_DATA_DIR environment variable
 */
export function getStorageDir(): string {
	if (process.env.SUPERSET_CLI_DATA_DIR) {
		return process.env.SUPERSET_CLI_DATA_DIR;
	}

	return join(homedir(), ".superset", "cli");
}

/**
 * Get the full path to the database file
 * Default: ~/.superset/cli/db.json
 */
export function getDbPath(): string {
	return join(getStorageDir(), "db.json");
}

/**
 * Ensure the storage directory exists
 * Creates the directory structure if it doesn't exist
 */
export async function ensureStorageDir(): Promise<void> {
	const storageDir = getStorageDir();

	if (!existsSync(storageDir)) {
		await mkdir(storageDir, { recursive: true, mode: 0o700 });
	}
}
