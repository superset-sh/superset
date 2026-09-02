import { Database } from "bun:sqlite";
import { afterEach, beforeEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { settings } from "@superset/local-db/schema";
import { getTableConfig } from "drizzle-orm/sqlite-core";

/**
 * Point SUPERSET_HOME_DIR at a fresh temp dir for every test in the calling
 * file, restoring the previous value afterwards.
 */
export function withTempSupersetHome(prefix: string): { readonly dir: string } {
	let dir = "";
	let previousHome: string | undefined;

	beforeEach(() => {
		previousHome = process.env.SUPERSET_HOME_DIR;
		dir = mkdtempSync(join(tmpdir(), prefix));
		process.env.SUPERSET_HOME_DIR = dir;
	});

	afterEach(() => {
		if (previousHome === undefined) delete process.env.SUPERSET_HOME_DIR;
		else process.env.SUPERSET_HOME_DIR = previousHome;
		rmSync(dir, { recursive: true, force: true });
	});

	return {
		get dir() {
			return dir;
		},
	};
}

/** Create local.db with the real settings columns, like the desktop app would. */
export function createLocalSettingsDb(homeDir: string, rowId?: number): void {
	const { columns } = getTableConfig(settings);
	const ddl = columns
		.map(
			(column) =>
				`"${column.name}" ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}`,
		)
		.join(", ");
	const sqlite = new Database(join(homeDir, "local.db"));
	sqlite.exec(`CREATE TABLE settings (${ddl})`);
	if (rowId !== undefined) {
		sqlite.exec(
			`INSERT INTO settings (id, confirm_on_quit) VALUES (${rowId}, 1)`,
		);
	}
	sqlite.close();
}
