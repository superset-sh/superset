import { Database } from "bun:sqlite";
import { existsSync } from "node:fs";
import { CLIError } from "@superset/cli-framework";
import {
	type InsertSettings,
	type SelectSettings,
	settings,
} from "@superset/local-db/schema";
import { drizzle } from "drizzle-orm/bun-sqlite";
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

function isMissingTableError(error: unknown): boolean {
	return error instanceof Error && error.message.includes("no such table");
}

/**
 * Read the desktop settings row. Returns undefined when the database or
 * settings row doesn't exist yet (fresh machine) — callers fall back to
 * app defaults.
 */
export function readSettingsRow(): SelectSettings | undefined {
	if (!existsSync(getLocalDbPath())) return undefined;
	const { sqlite, db } = openLocalDb();
	try {
		// first row, no id filter — mirrors the desktop's getSettings() so a
		// legacy row with a non-1 id can't make the CLI and app disagree
		return db.select().from(settings).get();
	} catch (error) {
		if (isMissingTableError(error)) return undefined;
		throw error;
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
	const { sqlite, db } = openLocalDb();
	try {
		db.insert(settings)
			.values({ id: 1, ...patch })
			.onConflictDoUpdate({ target: settings.id, set: patch })
			.run();
	} catch (error) {
		if (isMissingTableError(error)) {
			throw new CLIError(
				"The Superset local database has no settings table",
				"Launch the Superset desktop app once to run its migrations, then retry.",
			);
		}
		throw error;
	} finally {
		sqlite.close();
	}
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
			const row = db.select().from(settings).get();
			const { patch, result } = updater(row);
			db.insert(settings)
				// Target the row that was read: legacy DBs can hold a non-1 row id
				// (see readSettingsRow), and upserting id 1 there would split
				// settings across two rows.
				.values({ id: row?.id ?? 1, ...patch })
				.onConflictDoUpdate({ target: settings.id, set: patch })
				.run();
			return result;
		});
		return transaction.immediate();
	} catch (error) {
		if (isMissingTableError(error)) {
			throw new CLIError(
				"The Superset local database has no settings table",
				"Launch the Superset desktop app once to run its migrations, then retry.",
			);
		}
		throw error;
	} finally {
		sqlite.close();
	}
}
