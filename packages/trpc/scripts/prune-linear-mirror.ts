import { db } from "@superset/db/client";
import { seedDefaultStatuses } from "@superset/db/seed-default-statuses";
import { type SQL, sql } from "drizzle-orm";

/**
 * Retires the Linear task mirror once the two-way sync is gone.
 *
 * A mirrored row is a task the sync wrote: external_provider = 'linear' and a
 * Linear status. While an organization was connected its native tasks could
 * also be given a Linear status; those are kept.
 *
 * 1. Kept tasks in a Linear status move to the organization's native status of
 *    the same type: native tasks, and mirrored rows something references (any
 *    foreign key into tasks.id: v2_workspaces.task_id, comments, ...).
 * 2. Every kept task linked to a Linear issue gets a task_imports row carrying
 *    the Linear id and URL, then drops its external_* columns, so
 *    number-tasks.ts numbers it on the next run.
 * 3. Every other mirrored row is deleted. Activity that named a Linear status
 *    moves to the native one, then the Linear statuses go.
 *
 * Host workspaces keep their own copy of task_id in host.db. Only the cloud
 * reference is visible here, so a host-only workspace pointing at a deleted row
 * reads "task not found" afterwards.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again. Run
 * number-tasks.ts --apply after it.
 *
 * Usage: bun run packages/trpc/scripts/prune-linear-mirror.ts [--apply]
 */

const DELETE_BATCH_BLOCKS = 2_000;
const PAUSE_BETWEEN_BATCHES_MS = 250;

const apply = process.argv.includes("--apply");

const linearStatusIds = sql`SELECT id FROM task_statuses WHERE external_provider = 'linear'`;
const inLinearStatus = sql`t.status_id IN (${linearStatusIds})`;
const mirrored = sql`${inLinearStatus} AND t.external_provider = 'linear'`;

interface ReferencingColumn {
	table: string;
	column: string;
}

async function referencingColumns(): Promise<ReferencingColumn[]> {
	const rows = await db.execute<{ table_name: string; column_name: string }>(
		sql`
			SELECT format('%I.%I', n.nspname, c.relname) AS table_name,
				a.attname AS column_name
			FROM pg_constraint con
			JOIN pg_class c ON c.oid = con.conrelid
			JOIN pg_namespace n ON n.oid = c.relnamespace
			JOIN pg_attribute a
				ON a.attrelid = con.conrelid AND a.attnum = con.conkey[1]
			WHERE con.contype = 'f'
				AND con.confrelid = 'public.tasks'::regclass
				AND c.relname <> 'task_imports'
		`,
	);
	return rows.rows.map((row) => ({
		table: row.table_name,
		column: row.column_name,
	}));
}

function isReferenced(columns: ReferencingColumn[]): SQL {
	if (columns.length === 0) return sql`false`;
	return sql.join(
		columns.map(
			(ref) =>
				sql`EXISTS (SELECT 1 FROM ${sql.raw(ref.table)} r WHERE r.${sql.raw(`"${ref.column}"`)} = t.id)`,
		),
		sql` OR `,
	);
}

/** The organization's native status matching a Linear status's type, else its backlog. */
function nativeStatusFor(linearStatusId: SQL, organizationId: SQL): SQL {
	return sql`COALESCE(
		(
			SELECT s.id FROM task_statuses s, task_statuses linear_status
			WHERE linear_status.id = ${linearStatusId}
				AND s.organization_id = ${organizationId}
				AND s.external_provider IS NULL
				AND s.type = CASE linear_status.type
					WHEN 'triage' THEN 'backlog'
					WHEN 'duplicate' THEN 'canceled'
					ELSE linear_status.type
				END
			ORDER BY s.position
			LIMIT 1
		),
		(
			SELECT b.id FROM task_statuses b
			WHERE b.organization_id = ${organizationId}
				AND b.external_provider IS NULL
				AND b.type = 'backlog'
			ORDER BY b.position
			LIMIT 1
		)
	)`;
}

async function count(where: SQL): Promise<number> {
	const result = await db.execute<{ n: number }>(
		sql`SELECT count(*)::int AS n FROM tasks t WHERE ${where}`,
	);
	return result.rows[0]?.n ?? 0;
}

async function keepTasksInLinearStatuses(columns: ReferencingColumn[]) {
	const native = sql`${inLinearStatus} AND t.external_provider IS DISTINCT FROM 'linear'`;
	const referenced = sql`${mirrored} AND (${isReferenced(columns)})`;
	const kept = sql`${inLinearStatus} AND (t.external_provider IS DISTINCT FROM 'linear' OR ${isReferenced(columns)})`;
	console.log(
		`native tasks in a Linear status to keep: ${await count(native)}`,
	);
	console.log(`referenced mirrored rows to keep: ${await count(referenced)}`);
	if (!apply) return;

	const orgs = await db.execute<{ organization_id: string }>(
		sql`SELECT DISTINCT t.organization_id FROM tasks t WHERE ${kept}`,
	);
	for (const { organization_id } of orgs.rows) {
		await seedDefaultStatuses(organization_id);
	}

	await db.execute(sql`
		INSERT INTO task_imports (task_id, organization_id, provider, external_id, external_url, imported_by_user_id)
		SELECT t.id, t.organization_id, 'linear', t.external_id, t.external_url, NULL
		FROM tasks t
		WHERE ${kept} AND t.external_provider = 'linear'
			AND t.external_id IS NOT NULL AND t.external_url IS NOT NULL
		ON CONFLICT DO NOTHING
	`);
	await db.execute(sql`
		UPDATE tasks t SET status_id = ${nativeStatusFor(sql`t.status_id`, sql`t.organization_id`)}
		WHERE ${kept}
	`);
}

async function recordLinkedNativeTasks() {
	const linked = sql`t.external_provider = 'linear'
		AND t.external_id IS NOT NULL
		AND t.external_url IS NOT NULL
		AND NOT (${inLinearStatus})
		AND NOT EXISTS (SELECT 1 FROM task_imports i WHERE i.task_id = t.id)`;
	console.log(
		`native tasks to record as Linear imports: ${await count(linked)}`,
	);
	if (!apply) return;
	await db.execute(sql`
		INSERT INTO task_imports (task_id, organization_id, provider, external_id, external_url, imported_by_user_id)
		SELECT t.id, t.organization_id, 'linear', t.external_id, t.external_url, NULL
		FROM tasks t WHERE ${linked}
		ON CONFLICT DO NOTHING
	`);
}

async function detachKeptTasks() {
	const attached = sql`t.external_provider = 'linear' AND NOT (${inLinearStatus})`;
	console.log(`kept tasks to detach from Linear: ${await count(attached)}`);
	if (!apply) return;
	await db.execute(sql`
		UPDATE tasks t SET
			external_provider = NULL,
			external_id = NULL,
			external_key = NULL,
			external_url = NULL,
			external_updated_at = NULL,
			external_project_id = NULL,
			external_project_name = NULL,
			external_cycle_id = NULL,
			external_cycle_name = NULL,
			last_synced_at = NULL,
			sync_error = NULL
		WHERE ${attached}
	`);
}

async function deleteMirroredRows(columns: ReferencingColumn[]) {
	const unreferenced = sql`${mirrored} AND NOT (${isReferenced(columns)})`;
	const total = await count(unreferenced);
	console.log(`unreferenced mirrored rows to delete: ${total}`);
	if (!apply) return;

	const pages = await db.execute<{ blocks: number }>(
		sql`SELECT (pg_relation_size('tasks') / current_setting('block_size')::int)::int AS blocks`,
	);
	const blocks = pages.rows[0]?.blocks ?? 0;

	// Walks the table in physical order: on cold storage a block-range scan reads
	// sequentially, where picking rows through an index reads one page per row.
	let deleted = 0;
	for (let block = 0; block < blocks; block += DELETE_BATCH_BLOCKS) {
		const result = await db.execute(sql`
			DELETE FROM tasks t
			WHERE t.ctid >= ${`(${block},0)`}::tid
				AND t.ctid < ${`(${block + DELETE_BATCH_BLOCKS},0)`}::tid
				AND ${unreferenced}
		`);
		deleted += result.rowCount ?? 0;
		console.log(
			`deleted ${deleted}/${total} (block ${Math.min(block + DELETE_BATCH_BLOCKS, blocks)}/${blocks})`,
		);
		await new Promise((resolve) =>
			setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS),
		);
	}
}

async function moveActivityToNativeStatuses() {
	for (const column of ["from_status_id", "to_status_id"]) {
		const ref = sql.raw(`a.${column}`);
		const result = await db.execute<{ n: number }>(sql`
			SELECT count(*)::int AS n FROM task_activity a
			WHERE ${ref} IN (${linearStatusIds})
		`);
		console.log(
			`activity ${column} values to move to native statuses: ${result.rows[0]?.n ?? 0}`,
		);
		if (!apply) continue;
		await db.execute(sql`
			UPDATE task_activity a SET ${sql.raw(column)} = ${nativeStatusFor(ref, sql`t.organization_id`)}
			FROM tasks t
			WHERE t.id = a.task_id AND ${ref} IN (${linearStatusIds})
		`);
	}
}

async function deleteUnusedLinearStatuses() {
	const unused = sql`s.external_provider = 'linear'
		AND NOT EXISTS (SELECT 1 FROM tasks t WHERE t.status_id = s.id)`;
	const result = await db.execute<{ n: number }>(
		sql`SELECT count(*)::int AS n FROM task_statuses s WHERE ${unused}`,
	);
	console.log(`unused Linear statuses to delete: ${result.rows[0]?.n ?? 0}`);
	if (!apply) return;
	await db.execute(sql`DELETE FROM task_statuses s WHERE ${unused}`);
}

const columns = await referencingColumns();
console.log(
	`references into tasks.id: ${columns.map((ref) => `${ref.table}.${ref.column}`).join(", ") || "none"}`,
);
await keepTasksInLinearStatuses(columns);
await recordLinkedNativeTasks();
await detachKeptTasks();
await deleteMirroredRows(columns);
await moveActivityToNativeStatuses();
await deleteUnusedLinearStatuses();
console.log(apply ? "done" : "dry run; pass --apply to write");
