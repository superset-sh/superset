/**
 * Seeds `tasks.previous_slugs` for tasks that were pushed to Linear before
 * slug rewrites were recorded. Their title slug was replaced by the issue key
 * with no trace, so links shared before the push stopped resolving.
 *
 * Runs in id-ordered batches with a commit each, so it is safe against a
 * live database and idempotent: rows that already carry a previous slug are
 * skipped. Restrict to one organization with `--org <id>`.
 *
 *   bun run --cwd packages/db backfill:task-previous-slugs [--org <id>]
 */
import { and, asc, eq, gt, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "../client";
import { tasks } from "../schema";

const BATCH_SIZE = 2000;

// SQL twin of generateBaseTaskSlug from @superset/shared/task-slug.
const titleSlug = sql`left(regexp_replace(regexp_replace(lower(${tasks.title}), '[^a-z0-9]+', '-', 'g'), '^-|-$', '', 'g'), 50)`;

function parseOrgArg(): string | undefined {
	const index = process.argv.indexOf("--org");
	if (index === -1) return undefined;
	const value = process.argv[index + 1];
	if (!value) throw new Error("--org needs an organization id");
	return value;
}

async function main() {
	const organizationId = parseOrgArg();
	let after: string | null = null;
	let scanned = 0;
	let updated = 0;

	while (true) {
		const rows: { id: string }[] = await db
			.select({ id: tasks.id })
			.from(tasks)
			.where(
				and(
					isNotNull(tasks.externalProvider),
					eq(tasks.slug, tasks.externalKey),
					sql`${tasks.previousSlugs} = '{}'`,
					organizationId ? eq(tasks.organizationId, organizationId) : undefined,
					after ? gt(tasks.id, after) : undefined,
				),
			)
			.orderBy(asc(tasks.id))
			.limit(BATCH_SIZE);
		if (rows.length === 0) break;

		const result = await db
			.update(tasks)
			.set({ previousSlugs: sql`ARRAY[${titleSlug}]` })
			.where(
				and(
					inArray(
						tasks.id,
						rows.map((row) => row.id),
					),
					sql`${tasks.previousSlugs} = '{}'`,
					sql`${titleSlug} NOT IN ('', ${tasks.slug})`,
				),
			);

		scanned += rows.length;
		updated += result.rowCount ?? 0;
		after = rows[rows.length - 1]?.id ?? null;
		console.log(`scanned ${scanned}, updated ${updated}`);
	}

	console.log(`done: scanned ${scanned}, updated ${updated}`);
}

main()
	.then(() => process.exit(0))
	.catch((error) => {
		console.error(error);
		process.exit(1);
	});
