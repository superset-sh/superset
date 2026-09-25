import { neon } from "@neondatabase/serverless";
import journal from "../drizzle/meta/_journal.json";
import { env } from "./env";

/**
 * Fails unless the newest migration in the repo is the newest one recorded in
 * the database. The deploy runs it after `drizzle-kit migrate` so a migration
 * that did not apply cannot pass as one that did, whatever the migrate step's
 * exit code said.
 *
 * Usage: bun run packages/db/src/verify-migrations-applied.ts
 */
async function verifyMigrationsApplied(): Promise<void> {
	const expected = journal.entries.at(-1);
	if (!expected) throw new Error("The migration journal has no entries");

	const sql = neon(env.DATABASE_URL_UNPOOLED);
	const [row] = await sql`
		select max(created_at)::text as latest from drizzle.__drizzle_migrations
	`;
	const latest = row?.latest ? Number(row.latest) : null;

	if (latest !== expected.when) {
		throw new Error(
			`Database is not at ${expected.tag}: newest applied migration is ${latest ?? "none"}, expected ${expected.when}`,
		);
	}
	console.log(`Database is at ${expected.tag}`);
}

verifyMigrationsApplied().catch((error) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
