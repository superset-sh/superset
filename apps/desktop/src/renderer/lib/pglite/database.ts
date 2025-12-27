import { PGlite } from "@electric-sql/pglite";
import { type LiveNamespace, live } from "@electric-sql/pglite/live";
import { electricSync, type PGliteWithSync } from "@electric-sql/pglite-sync";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "./migrate";
import * as schema from "./schema";

export type PGliteWithExtensions = PGlite & {
	live: LiveNamespace;
	sync: PGliteWithSync["sync"];
};

export type Database = Awaited<ReturnType<typeof createDatabase>>;
export type DrizzleDB = Database["db"];

// Module-level resolved instances (set after database promise resolves)
let _db: DrizzleDB | null = null;

export function getDb(): DrizzleDB {
	if (!_db)
		throw new Error(
			"Database not initialized - ensure PGliteProvider has mounted",
		);
	return _db;
}

async function createDatabase() {
	const pg = (await PGlite.create("idb://superset", {
		extensions: {
			live,
			sync: electricSync(),
		},
	})) as PGliteWithExtensions;

	await migrate(pg);

	const db = drizzle(pg, { schema });
	_db = db; // Store for synchronous access in hooks

	return { pg, db };
}

// Module singleton - only runs once
export const database = createDatabase();

export { schema };
