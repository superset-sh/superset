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

export type DrizzleDB = ReturnType<typeof drizzle<typeof schema>>;

interface DatabaseState {
	pg: PGliteWithExtensions;
	db: DrizzleDB;
}

// Cache to prevent double-creation from React StrictMode
const dbCache = new Map<string, Promise<DatabaseState>>();

/**
 * Open (or create) a PGlite database for a specific organization.
 * Each organization gets its own IndexedDB: idb://superset_{organizationId}
 * Cached to handle React StrictMode double-invocation.
 */
export async function openOrganizationDatabase(
	organizationId: string,
): Promise<DatabaseState> {
	const cached = dbCache.get(organizationId);
	if (cached) return cached;

	const promise = (async () => {
		const pg = (await PGlite.create(`idb://superset_${organizationId}`, {
			extensions: { live, sync: electricSync() },
		})) as PGliteWithExtensions;

		await migrate(pg);

		return { pg, db: drizzle(pg, { schema }) };
	})();

	dbCache.set(organizationId, promise);
	return promise;
}

/**
 * Close and remove a database from the cache.
 * Call this when switching organizations.
 */
export async function closeOrganizationDatabase(
	organizationId: string,
): Promise<void> {
	const cached = dbCache.get(organizationId);
	if (cached) {
		dbCache.delete(organizationId);
		const { pg } = await cached;
		await pg.close();
	}
}

export { schema };
