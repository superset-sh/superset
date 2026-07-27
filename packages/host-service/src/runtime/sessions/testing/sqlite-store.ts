import { Database as BunDatabase } from "bun:sqlite";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import type { HostDb } from "../../../db";
import * as schema from "../../../db/schema";
import { SqliteSessionMetaStore } from "../session-meta-store";

const MIGRATIONS_FOLDER = resolve(import.meta.dir, "../../../../drizzle");

/** In-memory host DB + canonical session metadata store for unit tests. */
export function makeMetaStoreDb(): {
	metaStore: SqliteSessionMetaStore;
	db: HostDb;
} {
	const sqlite = new BunDatabase(":memory:");
	sqlite.exec("PRAGMA foreign_keys = ON");
	const bunDb = drizzle(sqlite, { schema });
	migrate(bunDb, { migrationsFolder: MIGRATIONS_FOLDER });
	// Same shim as createTestHost: bun:sqlite and better-sqlite3 back the
	// same drizzle API; prod uses better-sqlite3 on bundled Node.
	const db = bunDb as unknown as HostDb;
	return { metaStore: new SqliteSessionMetaStore(db), db };
}
