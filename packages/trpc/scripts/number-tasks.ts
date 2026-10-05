import { db, dbWs } from "@superset/db/client";
import { tasks } from "@superset/db/schema";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

/**
 * Puts every native task on its organization's team and gives it a
 * `<key>-<number>` slug, numbered in creation order, from the same
 * reserve_task_numbers counter the insert trigger uses. Linear-mirrored rows
 * are left alone; the mirror prune removes them.
 *
 * Run it before an organization disconnects Linear: the team's numbers start
 * above the highest Linear identifier that uses the same key.
 *
 * Reports what it would do unless `--apply` is passed. Safe to run again.
 *
 * Usage: bun run packages/trpc/scripts/number-tasks.ts [--apply]
 */

const BATCH_SIZE = 1_000;
const PAUSE_BETWEEN_BATCHES_MS = 100;

const apply = process.argv.includes("--apply");

const unnumbered = (organizationId: string) =>
	and(
		eq(tasks.organizationId, organizationId),
		isNull(tasks.teamId),
		isNull(tasks.externalProvider),
	);

const pending = await db.execute<{ organization_id: string; n: number }>(sql`
	SELECT organization_id, count(*)::int AS n
	FROM tasks
	WHERE team_id IS NULL AND external_provider IS NULL
	GROUP BY organization_id
`);
const total = pending.rows.reduce((sum, row) => sum + row.n, 0);
console.log(
	`tasks to number: ${total} in ${pending.rows.length} organizations`,
);
if (!apply) {
	console.log("dry run; pass --apply to write");
	process.exit(0);
}

let numbered = 0;
for (const { organization_id: organizationId } of pending.rows) {
	for (;;) {
		const batch = await dbWs.transaction(async (tx) => {
			const rows = await tx
				.select({ id: tasks.id })
				.from(tasks)
				.where(unnumbered(organizationId))
				.orderBy(asc(tasks.createdAt), asc(tasks.id))
				.limit(BATCH_SIZE)
				.for("update");
			if (rows.length === 0) return 0;

			const {
				rows: [reserved],
			} = await tx.execute<{
				reserved_team_id: string;
				reserved_key: string;
				reserved_last_number: number;
			}>(
				sql`SELECT * FROM reserve_task_numbers(${organizationId}, NULL, ${rows.length})`,
			);
			if (!reserved) throw new Error(`No numbers for ${organizationId}`);
			const offset = reserved.reserved_last_number - rows.length;

			await tx.execute(sql`
				UPDATE tasks
				SET team_id = ${reserved.reserved_team_id},
					number = picked.position + ${offset}::int,
					slug = ${reserved.reserved_key} || '-' || (picked.position + ${offset}::int)
				FROM jsonb_to_recordset(${JSON.stringify(
					rows.map((row, index) => ({ id: row.id, position: index + 1 })),
				)}::jsonb) AS picked(id uuid, position int)
				WHERE tasks.id = picked.id
			`);
			return rows.length;
		});

		numbered += batch;
		console.log(`numbered ${numbered}/${total}`);
		if (batch < BATCH_SIZE) break;
		await new Promise((resolve) =>
			setTimeout(resolve, PAUSE_BETWEEN_BATCHES_MS),
		);
	}
}
console.log("done");
process.exit(0);
