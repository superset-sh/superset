/**
 * Browser-compatible migration runner for PGlite
 *
 * Unlike drizzle-orm's built-in migrator which requires filesystem access,
 * this works with pre-bundled SQL migrations imported at build time.
 */

import type { PGlite } from "@electric-sql/pglite";
import { type Migration, migrations } from "./migrations";

const MIGRATIONS_TABLE = "__drizzle_migrations";

interface AppliedMigration {
	id: number;
	hash: string;
	created_at: number;
}

async function hashString(str: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(str);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function ensureMigrationsTable(pg: PGlite): Promise<void> {
	await pg.exec(`
		CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
			id SERIAL PRIMARY KEY,
			hash TEXT NOT NULL,
			created_at BIGINT NOT NULL
		)
	`);
}

async function getAppliedMigrations(pg: PGlite): Promise<AppliedMigration[]> {
	const result = await pg.query<AppliedMigration>(
		`SELECT id, hash, created_at FROM "${MIGRATIONS_TABLE}" ORDER BY id`,
	);
	return result.rows;
}

async function applyMigration(
	pg: PGlite,
	migration: Migration,
	hash: string,
): Promise<void> {
	// Split by statement breakpoint and execute each statement
	const statements = migration.sql.split("--> statement-breakpoint");

	for (const statement of statements) {
		const trimmed = statement.trim();
		if (trimmed) {
			await pg.exec(trimmed);
		}
	}

	// Record the migration
	await pg.exec(
		`INSERT INTO "${MIGRATIONS_TABLE}" (hash, created_at) VALUES ('${hash}', ${Date.now()})`,
	);
}

export async function migrate(pg: PGlite): Promise<void> {
	await ensureMigrationsTable(pg);

	const applied = await getAppliedMigrations(pg);
	const appliedHashes = new Set(applied.map((m) => m.hash));

	for (const migration of migrations) {
		const hash = await hashString(migration.sql);

		if (appliedHashes.has(hash)) {
			continue;
		}

		console.log(`[pglite-migrate] Applying migration: ${migration.tag}`);

		try {
			await applyMigration(pg, migration, hash);
			console.log(`[pglite-migrate] Applied: ${migration.tag}`);
		} catch (error) {
			console.error(
				`[pglite-migrate] Failed to apply ${migration.tag}:`,
				error,
			);
			throw error;
		}
	}

	console.log("[pglite-migrate] Migrations complete");
}
