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

	const db = drizzle(sqlite, { schema });

	console.error(
		`[host-service:db] Initialized at ${dbPath}, migrations from ${migrationsFolder}`,
	);

	// Migrations run with foreign keys OFF. Drizzle's generated table
	// rebuilds emit `PRAGMA foreign_keys=OFF`, but its migrator wraps every
	// migration in one transaction where that pragma is a silent no-op — so
	// with FKs on, a rebuild's `DROP TABLE` fires ON DELETE actions into
	// child tables (e.g. nulling terminal_sessions.origin_workspace_id).
	// Disabling at the connection level (outside any transaction) makes the
	// generated SQL behave as written; foreign_key_check then catches any
	// violation a migration actually introduced.
	sqlite.pragma("foreign_keys = OFF");
	// Let a failed migration throw — never serve a half-migrated DB.
	migrate(db, { migrationsFolder });
	const violations = sqlite.pragma("foreign_key_check") as unknown[];
	if (violations.length > 0) {
		throw new Error(
			`[host-service:db] Migration at ${dbPath} left ${violations.length} foreign key violation(s): ${JSON.stringify(violations.slice(0, 5))}`,
		);
	}
	sqlite.pragma("foreign_keys = ON");

	return db;
}
