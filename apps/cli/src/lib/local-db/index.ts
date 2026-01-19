import { chmodSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import * as schema from "@superset/local-db";

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";

// Use .superset (same as desktop production) so CLI and desktop share data
const SUPERSET_HOME_DIR = join(homedir(), ".superset");
const DB_PATH = join(SUPERSET_HOME_DIR, "local.db");
const SUPERSET_HOME_DIR_MODE = 0o700;
const SUPERSET_SENSITIVE_FILE_MODE = 0o600;

function ensureSupersetHomeDirExists(): void {
	if (!existsSync(SUPERSET_HOME_DIR)) {
		mkdirSync(SUPERSET_HOME_DIR, {
			recursive: true,
			mode: SUPERSET_HOME_DIR_MODE,
		});
	}

	try {
		chmodSync(SUPERSET_HOME_DIR, SUPERSET_HOME_DIR_MODE);
	} catch {
		// Best-effort
	}
}

/**
 * Gets the migrations directory path.
 * For CLI, we look relative to this file in the monorepo structure.
 */
function getMigrationsDirectory(): string {
	// From apps/cli/src/lib/local-db -> packages/local-db/drizzle
	// Need to go up 5 levels: local-db -> lib -> src -> cli -> apps -> root
	const monorepoPath = join(
		__dirname,
		"../../../../../packages/local-db/drizzle",
	);
	if (existsSync(monorepoPath)) {
		return monorepoPath;
	}

	// Fallback for built CLI: try relative to dist
	// When built, __dirname will be in dist/
	const distPath = join(__dirname, "../../../../packages/local-db/drizzle");
	if (existsSync(distPath)) {
		return distPath;
	}

	// Another fallback: absolute path based on typical monorepo structure
	const cwdPath = join(process.cwd(), "packages/local-db/drizzle");
	if (existsSync(cwdPath)) {
		return cwdPath;
	}

	console.warn(
		`[cli/local-db] Migrations directory not found. Tried:\n` +
			`  - ${monorepoPath}\n` +
			`  - ${distPath}\n` +
			`  - ${cwdPath}`,
	);
	return monorepoPath;
}

// Singleton database instance
let _localDb: ReturnType<typeof drizzle> | null = null;

/**
 * Gets or creates the local SQLite database connection.
 * The database is shared with the desktop app at ~/.superset/local.db
 */
export function getLocalDb() {
	if (_localDb) {
		return _localDb;
	}

	ensureSupersetHomeDirExists();

	const sqlite = new Database(DB_PATH, { create: true });
	try {
		chmodSync(DB_PATH, SUPERSET_SENSITIVE_FILE_MODE);
	} catch {
		// Best-effort; directory permissions should still protect the DB.
	}
	sqlite.exec("PRAGMA journal_mode = WAL");
	sqlite.exec("PRAGMA foreign_keys = OFF");


	_localDb = drizzle(sqlite, { schema });

	const migrationsFolder = getMigrationsDirectory();

	try {
		migrate(_localDb, { migrationsFolder });
	} catch (error) {
		console.error("[cli/local-db] Migration failed:", error);
		throw error;
	}

	return _localDb;
}

export type LocalDb = ReturnType<typeof getLocalDb>;

// Re-export schema for convenience
export { schema };
export const { projects, worktrees, workspaces, settings } = schema;
