import { sql } from "drizzle-orm";
import type { AnyPgTable } from "drizzle-orm/pg-core";

/**
 * Helper to build conflict update columns using excluded values from INSERT
 * Used for PostgreSQL upsert operations with ON CONFLICT DO UPDATE
 *
 * @param table - The table definition
 * @param columns - Array of column names to update on conflict
 * @returns Object mapping column names to excluded values
 */
export function buildConflictUpdateColumns<T extends AnyPgTable>(
	_table: T,
	columns: (keyof T["$inferInsert"])[],
) {
	const updateColumns = {} as Record<string, unknown>;

	for (const column of columns) {
		const columnName = String(column);
		updateColumns[columnName] = sql.raw(`excluded.${columnName}`);
	}

	return updateColumns;
}
