import { getTableColumns, type SQL, sql } from "drizzle-orm";
import type { PgTable, PgTransaction } from "drizzle-orm/pg-core";

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

export async function getCurrentTxid(
	// biome-ignore lint/suspicious/noExplicitAny: Transaction type varies by client (Neon, PostgresJs, etc)
	tx: PgTransaction<any, any, any>,
): Promise<number> {
	const result = await tx.execute<{ txid: string }>(
		sql`SELECT txid_current()::text as txid`,
	);
	return Number.parseInt(result.rows[0]?.txid ?? "", 10);
}
