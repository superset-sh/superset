import { mock } from "bun:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { executeRows } from "../../db/src/utils/execute-rows";

const shape = process.env.PRUNE_FIXTURE_SHAPE;
assert(shape === "neon" || shape === "postgres");
const apply = process.env.PRUNE_FIXTURE_APPLY === "1";
process.argv = [
	process.argv[0] ?? "bun",
	"prune-fixture",
	...(apply ? ["--apply"] : []),
];
const dialect = new PgDialect();
const queries: string[] = [];
const seeded: string[] = [];
const output: string[] = [];
const log = console.log;
console.log = (...values) => output.push(values.join(" "));

mock.module("@superset/db/client", () => ({
	db: {
		execute: async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
			const query = dialect
				.sqlToQuery(statement)
				.sql.replace(/\s+/g, " ")
				.trim();
			queries.push(query);
			const rows = query.includes("FROM pg_constraint")
				? [{ table_name: "public.v2_workspaces", column_name: "task_id" }]
				: query.startsWith("SELECT DISTINCT")
					? [{ organization_id: "org-a" }, { organization_id: "org-b" }]
					: query.includes("pg_relation_size")
						? [{ blocks: 1 }]
						: /count\(\*\)/.test(query)
							? [{ n: 2 }]
							: [];
			return shape === "neon"
				? { rows, rowCount: 2 }
				: Object.assign(rows, { count: 2 });
		},
	},
}));
mock.module("@superset/db/utils", () => ({ executeRows }));
mock.module("@superset/db/seed-default-statuses", () => ({
	seedDefaultStatuses: async (organizationId: string) =>
		seeded.push(organizationId),
}));

try {
	await import("./prune-linear-mirror");
} finally {
	console.log = log;
}

const writes = queries.filter((query) =>
	/^(INSERT|UPDATE|DELETE|WITH deleted)/.test(query),
);
assert(output.includes("native tasks in a Linear status to keep: 2"));
assert(output.includes("referenced mirrored rows to keep: 2"));
assert(output.some((line) => line.includes("public.v2_workspaces.task_id")));
if (apply) {
	assert.deepEqual(seeded, ["org-a", "org-b"]);
	assert.equal(writes.length, 8);
	assert(output.includes("deleted 2/2 (block 1/1)"));
	const deletion = writes.find((query) => /DELETE FROM tasks t/.test(query));
	assert(deletion?.includes('r."task_id" = t.id'));
	assert(deletion?.includes("t.ctid >="));
	assert(deletion?.includes("t.ctid <"));
	assert(
		writes.some(
			(query) =>
				query.startsWith("INSERT INTO task_imports") &&
				query.includes("ON CONFLICT DO NOTHING"),
		),
	);
} else {
	assert.deepEqual(seeded, []);
	assert.equal(writes.length, 0);
	assert(output.includes("dry run; pass --apply to write"));
}
console.log(
	JSON.stringify({
		shape,
		apply,
		writes: writes.length,
		queries: queries.length,
	}),
);
