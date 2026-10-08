import { db } from "@superset/db/client";
import { sql } from "drizzle-orm";

/**
 * Deletes the shared `Default` environment and the placeholder organization
 * that owned it. Nothing could start a workspace from it, so it is refused
 * when anything still points at either row.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again.
 *
 * Usage: bun run packages/trpc/scripts/delete-shared-environment.ts [--apply]
 */

const PLACEHOLDER_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000000";
const apply = process.argv.includes("--apply");

const references = await db.execute<{
	table_name: string;
	column_name: string;
}>(
	sql`
		SELECT c.conrelid::regclass::text AS table_name, a.attname AS column_name
		FROM pg_constraint c
		JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
		WHERE c.contype = 'f'
			AND c.confrelid = 'auth.organizations'::regclass
			AND c.conrelid <> 'environments'::regclass
	`,
);
const inUse: string[] = [];
for (const { table_name, column_name } of references.rows) {
	const result = await db.execute<{ n: number }>(
		sql`SELECT count(*)::int AS n FROM ${sql.raw(table_name)} WHERE ${sql.identifier(column_name)} = ${PLACEHOLDER_ORGANIZATION_ID}`,
	);
	const n = result.rows[0]?.n ?? 0;
	if (n > 0) inUse.push(`${table_name}.${column_name}: ${n}`);
}

const environments = await db.execute<{
	id: string;
	name: string;
	workspaces: number;
}>(
	sql`
		SELECT e.id, e.name,
			(SELECT count(*)::int FROM cloud_workspaces w WHERE w.environment_id = e.id) AS workspaces
		FROM environments e
		WHERE e.organization_id = ${PLACEHOLDER_ORGANIZATION_ID}
	`,
);
for (const row of environments.rows) {
	if (row.workspaces > 0)
		inUse.push(`environment ${row.name}: ${row.workspaces} workspaces`);
}

console.log(
	`environments to delete: ${environments.rows.map((row) => `${row.name} (${row.id})`).join(", ") || "none"}`,
);
if (inUse.length) {
	console.error(`refusing, still referenced:\n  ${inUse.join("\n  ")}`);
	process.exit(1);
}

if (apply) {
	await db.execute(
		sql`DELETE FROM environments WHERE organization_id = ${PLACEHOLDER_ORGANIZATION_ID}`,
	);
	const deleted = await db.execute(
		sql`DELETE FROM auth.organizations WHERE id = ${PLACEHOLDER_ORGANIZATION_ID}`,
	);
	console.log(
		`deleted; placeholder organization rows removed: ${deleted.rowCount ?? 0}`,
	);
} else {
	console.log("dry run; pass --apply to delete");
}
