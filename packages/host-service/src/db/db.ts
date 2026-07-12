import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.ts";

export type HostDb = ReturnType<typeof createDb>;

export function createDb(dbPath: string, migrationsFolder: string) {
	mkdirSync(dirname(dbPath), { recursive: true });

	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("busy_timeout = 5000");
	sqlite.pragma("foreign_keys = ON");

	const db = drizzle(sqlite, { schema });

	console.error(
		`[host-service:db] Initialized at ${dbPath}, migrations from ${migrationsFolder}`,
	);

	// Let a failed migration throw — never serve a half-migrated DB.
	migrate(db, { migrationsFolder });

	return db;
}
