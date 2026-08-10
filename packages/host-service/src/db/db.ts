import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema.ts";

export type HostDb = ReturnType<typeof createDb>;

/**
 * `foreign_key_check` rows keyed by `child table → parent table → fk index`,
 * with per-constraint row counts. Rowids are deliberately excluded: a drizzle
 * table rebuild reassigns them, so rowid-level comparison would misread a
 * surviving pre-existing violation as a new one.
 */
function violationCountsByConstraint(
	sqlite: InstanceType<typeof Database>,
): Map<string, number> {
	const rows = sqlite.pragma("foreign_key_check") as {
		table: string;
		parent: string;
		fkid: number;
	}[];
	const counts = new Map<string, number>();
	for (const row of rows) {
		const key = `${row.table}→${row.parent}#${row.fkid}`;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return counts;
}

export function createDb(dbPath: string, migrationsFolder: string) {
	mkdirSync(dirname(dbPath), { recursive: true });

	const sqlite = new Database(dbPath);
	sqlite.pragma("journal_mode = WAL");
	sqlite.pragma("busy_timeout = 5000");

	const db = drizzle(sqlite, { schema });

	console.error(
		`[host-service:db] Initialized at ${dbPath}, migrations from ${migrationsFolder}`,
	);

	// Migrations run with foreign keys OFF. Drizzle's generated table
	// rebuilds emit `PRAGMA foreign_keys=OFF`, but its migrator wraps every
	// migration in one transaction where that pragma is a silent no-op — so
	// with FKs on, a rebuild's `DROP TABLE` fires ON DELETE actions into
	// child tables (e.g. nulling terminal_sessions.origin_workspace_id).
	// Disabling at the connection level (outside any transaction) makes the
	// generated SQL behave as written; foreign_key_check then catches any
	// violation a migration actually introduced.
	sqlite.pragma("foreign_keys = OFF");
	// Snapshot violations before migrating: long-lived DBs can carry legacy
	// orphans (e.g. rows written/deleted by connections that never enabled
	// enforcement). Failing startup on those bricks a DB that worked on the
	// previous version — only violations a migration introduces are fatal.
	const before = violationCountsByConstraint(sqlite);
	// Let a failed migration throw — never serve a half-migrated DB.
	migrate(db, { migrationsFolder });
	const after = violationCountsByConstraint(sqlite);
	const introduced = [...after.entries()].filter(
		([constraint, count]) => count > (before.get(constraint) ?? 0),
	);
	if (introduced.length > 0) {
		throw new Error(
			`[host-service:db] Migration at ${dbPath} introduced foreign key violation(s): ${JSON.stringify(introduced)}`,
		);
	}
	if (after.size > 0) {
		console.error(
			`[host-service:db] Pre-existing foreign key violation(s) survive at ${dbPath} (not introduced by migration, serving anyway): ${JSON.stringify([...after.entries()])}`,
		);
	}
	sqlite.pragma("foreign_keys = ON");

	return db;
}
