import { existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type HostDb = ReturnType<typeof createDb>;

/**
 * Resolves the migrations folder for host-service's local SQLite DB.
 *
 * - Production (Electron packaged): process.resourcesPath/resources/host-migrations
 * - Dev (ELECTRON_RUN_AS_NODE child process): HOST_MIGRATIONS_PATH env var
 * - Standalone dev (serve.ts): relative from src/db/ to package root drizzle/
 * - Fallback: __dirname-based resolution
 */
function getMigrationsFolder(): string {
	// Electron packaged app (resourcesPath is Electron-specific)
	const resourcesPath = (process as unknown as Record<string, unknown>)
		.resourcesPath as string | undefined;
	if (resourcesPath && !process.env.ELECTRON_RUN_AS_NODE) {
		return join(resourcesPath, "resources/host-migrations");
	}

	// Dev child process: explicit env var from desktop
	if (process.env.HOST_MIGRATIONS_PATH) {
		return process.env.HOST_MIGRATIONS_PATH;
	}

	// Standalone dev (serve.ts) — import.meta.dirname = src/db/
	if (typeof import.meta.dirname === "string") {
		const candidate = join(import.meta.dirname, "../../drizzle");
		if (existsSync(candidate)) {
			return candidate;
		}
	}

	// Fallback
	return join(__dirname, "../../drizzle");
}

export function createDb(dbPath: string) {
	mkdirSync(dirname(dbPath), { recursive: true });

	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("foreign_keys = ON");

	const db = drizzle(sqlite, { schema });

	const migrationsFolder = getMigrationsFolder();
	console.log(
		`[host-service:db] Initialized at ${dbPath}, migrations from ${migrationsFolder}`,
	);

	try {
		migrate(db, { migrationsFolder });
	} catch (error) {
		console.error("[host-service:db] Migration failed:", error);
	}

	return db;
}
