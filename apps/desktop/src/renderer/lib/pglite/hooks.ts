import type { PGlite } from "@electric-sql/pglite";
import { useLiveQuery, usePGlite } from "@electric-sql/pglite-react";
import { and, desc, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";
import { type SelectTask, type SelectUser, tasks, users } from "./schema";

/** Get the Drizzle db instance for the current org's PGlite. */
export function useDb() {
	// Cast through unknown - usePGlite returns PGliteWithLive but drizzle expects PGlite
	return drizzle(usePGlite() as unknown as PGlite, { schema });
}

/**
 * Get all tasks for the current org.
 * Org is implicit - we're querying the per-org PGlite database.
 */
export function useTasks() {
	const db = useDb();
	const query = db
		.select()
		.from(tasks)
		.where(isNull(tasks.deleted_at))
		.orderBy(desc(tasks.created_at));

	const { sql, params } = query.toSQL();
	return useLiveQuery<SelectTask>(sql, params);
}

/**
 * Get users by IDs.
 */
export function useUsers(userIds: string[]) {
	const db = useDb();
	const query = db
		.select()
		.from(users)
		.where(and(inArray(users.id, userIds), isNull(users.deleted_at)));

	const { sql, params } = query.toSQL();
	return useLiveQuery<SelectUser>(sql, params);
}
