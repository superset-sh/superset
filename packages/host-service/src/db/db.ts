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
	sqlite.pragma("foreign_keys = ON");

	const db = drizzle(sqlite, { schema });

	console.error(
		`[host-service:db] Initialized at ${dbPath}, migrations from ${migrationsFolder}`,
	);

	// No catch — fail closed. drizzle runs all pending migrations in a single
	// BEGIN/COMMIT and ROLLBACKs on any error, so a failure leaves the DB at its
	// prior version (never half-applied). Letting it throw propagates to
	// `serve.ts` `main().catch(... process.exit(1))`, so the coordinator's health
	// check fails and it recovers (kill the stale process, respawn) instead of
	// silently serving a DB that's missing tables.
	migrate(db, { migrationsFolder });

	return db;
}
