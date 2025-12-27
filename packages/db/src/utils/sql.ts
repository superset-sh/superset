import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";

export function buildConflictUpdateColumns<
	T extends PgTable,
	Q extends keyof T["_"]["columns"],
>(table: T, columns: Q[]): Record<Q, SQL> {
	const cls = getTableColumns(table);
	return columns.reduce(
		(acc, column) => {
			const col = cls[column as string];
			acc[column] = sql.raw(`excluded.${col?.name}`);
			return acc;
		},
		{} as Record<Q, SQL>,
	);
}
