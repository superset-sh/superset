import type { PGlite } from "@electric-sql/pglite";
import { useLiveQuery, usePGlite } from "@electric-sql/pglite-react";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "./schema";

/** Get the Drizzle db instance for the current org's PGlite. */
export function useDb() {
	return drizzle(usePGlite() as unknown as PGlite, { schema });
}

type InferRowType<T> = T extends { execute: () => Promise<(infer R)[]> }
	? R
	: never;

/** Live query with type inference from Drizzle query builder. */
export function useLiveDrizzle<
	T extends {
		toSQL: () => { sql: string; params: unknown[] };
		execute: () => Promise<unknown[]>;
	},
>(query: T) {
	const { sql, params } = query.toSQL();
	return useLiveQuery<InferRowType<T>>(sql, params);
}
