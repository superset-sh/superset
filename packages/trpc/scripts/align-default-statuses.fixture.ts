import { mock } from "bun:test";
import assert from "node:assert/strict";
import { PgDialect } from "drizzle-orm/pg-core";
import { executeRows } from "../../db/src/utils/execute-rows";

const shape = process.env.STATUS_FIXTURE_SHAPE;
assert(shape === "neon" || shape === "postgres");
const apply = process.env.STATUS_FIXTURE_APPLY === "1";
process.argv = ["bun", "status-fixture", ...(apply ? ["--apply"] : [])];
const dialect = new PgDialect();
const queries: Array<{ sql: string; params: unknown[] }> = [];
const output: string[] = [];
const log = console.log;
console.log = (...values) => output.push(values.join(" "));

const db = {
	execute: async (statement: Parameters<PgDialect["sqlToQuery"]>[0]) => {
		const query = dialect.sqlToQuery(statement);
		const sql = query.sql.replace(/\s+/g, " ").trim();
		queries.push({ sql, params: query.params });
		const rows = sql.includes("count(*)")
			? [{ n: 2 }]
			: sql.startsWith("SELECT id, organization_id")
				? [
						{
							id: "status-a",
							organization_id: "org-a",
							progress_percent: null,
						},
						{ id: "status-b", organization_id: "org-a", progress_percent: 75 },
					]
				: [];
		return shape === "neon" ? { rows } : rows;
	},
};
mock.module("@superset/db/client", () => ({ db, dbWs: db }));
mock.module("@superset/db/utils", () => ({ executeRows }));

try {
	await import("./align-default-statuses");
} finally {
	console.log = log;
}

assert(output.includes("organizations to add In Review to: 2"));
assert(output.includes("started statuses to set progress on: 1"));
assert(output.includes("Done statuses to recolor: 2"));
const writes = queries.filter(({ sql }) => /^(INSERT|UPDATE)/.test(sql));
if (apply) {
	assert.equal(writes.length, 3);
	const progress = writes.find(({ sql }) =>
		sql.includes("SET progress_percent"),
	);
	assert(progress);
	assert.deepEqual(JSON.parse(String(progress.params[0])), [
		{ id: "status-a", progress: 50 },
	]);
	assert(output.includes("done"));
} else {
	assert.equal(writes.length, 0);
	assert(output.includes("dry run; pass --apply to write"));
}
console.log(JSON.stringify({ shape, apply, writes: writes.length }));
