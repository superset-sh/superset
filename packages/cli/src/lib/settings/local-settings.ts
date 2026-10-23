import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { CLIError } from "@superset/cli-framework";
import {
	type InsertSettings,
	type SelectSettings,
	settings,
} from "@superset/local-db/schema";
import { eq, getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { getLocalDbPath } from "./paths";
import type { SettingsColumn, SettingValue } from "./registry";

// The desktop app owns local.db and its migrations — the CLI must never
// create the file or its tables, only read/update the existing settings row.
// Always opened readwrite: readonly opens of a WAL-mode database fail with
// SQLITE_CANTOPEN when the -shm sidecar is missing (e.g. after a checkpoint),
// and the existsSync guard already prevents creating a fresh database.
function openLocalDb() {
	const path = getLocalDbPath();
	if (!existsSync(path)) {
		throw new CLIError(
			`Superset local database not found at ${path}`,
			"Launch the Superset desktop app once on this machine first.",
		);
	}
	let sqlite: Database;
	try {
		sqlite = new Database(path, { readwrite: true });
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new CLIError(
			`Could not open ${path} (${message})`,
			"Check the file's permissions; the CLI opens it read-write like the desktop app.",
		);
	}
	sqlite.exec("PRAGMA busy_timeout = 2000");
	return { sqlite, db: drizzle(sqlite) };
}

const SETTINGS_COLUMNS: Record<string, AnySQLiteColumn> =
	getTableColumns(settings);

/**
 * The settings columns this local.db has, by key. A database last migrated
 * by an older desktop app lacks newer columns, and a query that names one
 * fails for every setting. Null when there is no settings table yet.
 */
function getPresentColumns(
	sqlite: Database,
): Record<string, AnySQLiteColumn> | null {
	const names = new Set(
		(
			sqlite.query("PRAGMA table_info(settings)").all() as { name: string }[]
		).map((column) => column.name),
	);
	if (names.size === 0) return null;
	return Object.fromEntries(
		Object.entries(SETTINGS_COLUMNS).filter(([, column]) =>
			names.has(column.name),
		),
	);
}

// first row, no id filter — mirrors the desktop's getSettings() so a legacy
// row with a non-1 id can't make the CLI and app disagree
function selectSettingsRow(
	db: ReturnType<typeof drizzle>,
	columns: Record<string, AnySQLiteColumn>,
): SelectSettings | undefined {
	const row: Record<string, unknown> | undefined = db
		.select(columns)
		.from(settings)
		.get();
	if (!row) return undefined;
	const unset: Record<string, unknown> = Object.fromEntries(
		Object.keys(SETTINGS_COLUMNS).map((key) => [key, null]),
	);
	return { ...unset, ...row } as SelectSettings;
}

/**
 * Read the desktop settings row. Returns undefined when the database or
 * settings row doesn't exist yet (fresh machine) — callers fall back to
 * app defaults. Columns the database predates read as unset.
 */
export function readSettingsRow(): SelectSettings | undefined {
	if (!existsSync(getLocalDbPath())) return undefined;
	const { sqlite, db } = openLocalDb();
	try {
		const columns = getPresentColumns(sqlite);
		return columns ? selectSettingsRow(db, columns) : undefined;
	} finally {
		sqlite.close();
	}
}

/** Upsert a single column on the settings row, matching the desktop's writes. */
export function writeSetting(
	key: SettingsColumn,
	value: SettingValue | null,
): void {
	writeSettings({ [key]: value } as Partial<InsertSettings>);
}

/**
 * Atomically upsert several desktop settings columns. This is intentionally
 * kept below the public settings registry: feature-specific CLI commands may
 * need to update a value and its initialization marker together.
 */
export function writeSettings(patch: Partial<InsertSettings>): void {
	updateSettingsAtomically(() => ({ patch, result: undefined }));
}

/**
 * Read and update the settings row under one immediate SQLite transaction.
 * Use this for JSON columns that require read-modify-write so simultaneous CLI
 * processes cannot both read the same value and silently overwrite each other.
 */
export function updateSettingsAtomically<Result>(
	updater: (row: SelectSettings | undefined) => {
		patch: Partial<InsertSettings>;
		result: Result;
	},
): Result {
	const { sqlite, db } = openLocalDb();
	try {
		const transaction = sqlite.transaction(() => {
			const columns = getPresentColumns(sqlite);
			if (!columns) {
				throw new CLIError(
					"The Superset local database has no settings table",
					"Launch the Superset desktop app once to run its migrations, then retry.",
				);
			}
			const row = selectSettingsRow(db, columns);
			const { patch, result } = updater(row);
			const absent = Object.keys(patch).filter((key) => !(key in columns));
			if (absent.length > 0) {
				throw new CLIError(
					`This Superset local database predates the ${absent.join(", ")} setting`,
					"Update the Superset desktop app and launch it once to run its migrations, then retry.",
				);
			}
			// Target the row that was read: legacy DBs can hold a non-1 row id
			// (see selectSettingsRow), and writing id 1 there would split
			// settings across two rows. The insert names only the id so it
			// works on a database that predates newer columns.
			const id = row?.id ?? 1;
			if (!row) sqlite.query("INSERT INTO settings (id) VALUES (?)").run(id);
			db.update(settings).set(patch).where(eq(settings.id, id)).run();
			return result;
		});
		return transaction.immediate();
	} finally {
		sqlite.close();
	}
}
