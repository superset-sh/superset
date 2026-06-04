import { existsSync, renameSync } from "node:fs";
import * as Sentry from "@sentry/electron/main";
import log from "electron-log/main";

/**
 * SQLite result codes that indicate the database file itself is unusable and
 * the only safe recovery is to quarantine it and start fresh.
 *
 * better-sqlite3's SqliteError carries the result-code string in `.code`
 * (e.g. "SQLITE_CORRUPT", "SQLITE_CORRUPT_VTAB", "SQLITE_NOTADB").
 */
export function isSqliteCorruptionError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const code = (error as { code?: unknown }).code;
	if (typeof code !== "string") return false;
	return code.startsWith("SQLITE_CORRUPT") || code === "SQLITE_NOTADB";
}

/**
 * Renames a corrupt database (and its `-wal` / `-shm` sidecars, if present)
 * aside with a timestamped `.corrupt-<ts>` suffix so nothing is deleted and
 * the data can be recovered manually later. Returns the quarantined main path.
 */
export function quarantineCorruptDatabase(dbPath: string): string {
	const quarantinedPath = `${dbPath}.corrupt-${Date.now()}`;
	renameSync(dbPath, quarantinedPath);
	for (const sidecar of ["-wal", "-shm"]) {
		const sidecarPath = `${dbPath}${sidecar}`;
		if (existsSync(sidecarPath)) {
			renameSync(sidecarPath, `${quarantinedPath}${sidecar}`);
		}
	}
	return quarantinedPath;
}

/**
 * Opens a SQLite-backed resource with automatic recovery from on-disk
 * corruption. If `open` throws a corruption error, the file is quarantined and
 * `open` is retried once against the now-fresh path. Non-corruption errors are
 * rethrown untouched.
 *
 * CONTRACT: `open` MUST close any handle it created before throwing — Windows
 * cannot rename a file that is still open, so a leaked handle breaks recovery.
 */
export function openSqliteWithRecovery<T>(
	dbPath: string,
	label: string,
	open: () => T,
): T {
	try {
		return open();
	} catch (error) {
		if (!isSqliteCorruptionError(error)) throw error;

		const quarantinedPath = quarantineCorruptDatabase(dbPath);
		log.error(
			`[${label}] Detected corrupt SQLite database. Quarantined to ${quarantinedPath} and recreating.`,
			error,
		);
		// Best-effort: no-op in dev where Sentry is never initialized.
		try {
			Sentry.captureException(error);
		} catch {}

		return open();
	}
}
