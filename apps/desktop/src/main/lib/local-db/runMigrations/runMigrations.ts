import { type SQL, sql } from "drizzle-orm";
import { readMigrationFiles } from "drizzle-orm/migrator";

/**
 * The slice of a synchronous drizzle sqlite database this runner uses.
 * Declaring it structurally keeps the runner off the native driver, so the
 * tests can exercise this exact code on bun:sqlite — the only sqlite Bun can
 * load.
 */
export type MigrationDatabase = {
	run(query: SQL): unknown;
	all<TRow = unknown>(query: SQL): TRow[];
};

const MIGRATIONS_TABLE = sql.identifier("__drizzle_migrations");

/**
 * Applies every migration this database has not recorded yet.
 *
 * Drizzle's own migrator picks what to run by comparing each migration's
 * journal `when` against the single highest `created_at` in
 * `__drizzle_migrations`. That is a watermark, not a set, and it only moves
 * forward: a migration that arrives carrying a `when` below the watermark is
 * skipped, and stays skipped through every later upgrade. `when` records when
 * drizzle-kit generated the file, not the order files merged, so a machine
 * takes on a too-high watermark by running any build whose migration was
 * generated after — but shipped before — one still in flight elsewhere.
 * Branch and canary builds do that routinely.
 *
 * Keying on the set of recorded `created_at` values closes the hole and heals
 * databases that already lost a migration, whose `when` is simply absent from
 * the set. `created_at` is that same journal `when`, which drizzle has always
 * recorded, so this reads tables written by every previous version and writes
 * rows those versions still understand.
 *
 * It keys on `created_at` rather than `hash` deliberately: migrations 0004
 * through 0008 and 0011 were edited after they had already shipped, so the
 * hashes those machines recorded no longer match the files on disk, and
 * hashing would re-run migrations that are already applied.
 */
export function runMigrations(
	db: MigrationDatabase,
	migrationsFolder: string,
): void {
	const migrations = readMigrationFiles({ migrationsFolder });

	db.run(
		sql`CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
			id SERIAL PRIMARY KEY,
			hash text NOT NULL,
			created_at numeric
		)`,
	);

	const recorded = db.all<{ created_at: number | string | null }>(
		sql`SELECT created_at FROM ${MIGRATIONS_TABLE}`,
	);
	const applied = new Set(recorded.map((row) => Number(row.created_at)));

	const pending = migrations.filter(
		(migration) => !applied.has(migration.folderMillis),
	);
	if (pending.length === 0) return;

	db.run(sql`BEGIN`);
	try {
		for (const migration of pending) {
			for (const statement of migration.sql) {
				db.run(sql.raw(statement));
			}
			db.run(
				sql`INSERT INTO ${MIGRATIONS_TABLE} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`,
			);
		}
		db.run(sql`COMMIT`);
	} catch (error) {
		db.run(sql`ROLLBACK`);
		throw error;
	}
}
