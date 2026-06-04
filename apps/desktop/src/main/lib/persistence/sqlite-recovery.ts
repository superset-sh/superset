import { existsSync, renameSync } from "node:fs";

const SQLITE_SIDECAR_SUFFIXES = ["-wal", "-shm"] as const;

/**
 * SQLite reports an unusable on-disk database with `SQLITE_CORRUPT*`
 * (e.g. "database disk image is malformed") or `SQLITE_NOTADB` (the file is
 * not a database at all). Both are recoverable by rebuilding a cache DB.
 */
export function isSqliteCorruptionError(error: unknown): boolean {
	if (!error || typeof error !== "object") {
		return false;
	}
	const code = (error as { code?: unknown }).code;
	if (typeof code !== "string") {
		return false;
	}
	return code.startsWith("SQLITE_CORRUPT") || code === "SQLITE_NOTADB";
}

/**
 * Renames a corrupt SQLite database (and its `-wal`/`-shm` sidecars) aside with
 * a `.corrupt-<timestamp>` suffix rather than deleting it, so it can be
 * inspected later. Returns the quarantine path of the main DB file.
 */
export function quarantineCorruptDatabase(
	dbPath: string,
	timestamp: number = Date.now(),
): string {
	const quarantinePath = `${dbPath}.corrupt-${timestamp}`;
	if (existsSync(dbPath)) {
		renameSync(dbPath, quarantinePath);
	}
	for (const suffix of SQLITE_SIDECAR_SUFFIXES) {
		const sidecar = `${dbPath}${suffix}`;
		if (existsSync(sidecar)) {
			renameSync(sidecar, `${quarantinePath}${suffix}`);
		}
	}
	return quarantinePath;
}

/**
 * Opens a SQLite-backed resource, recovering once from on-disk corruption: if
 * `open` throws a corruption-style error, the corrupt DB is quarantined and
 * `open` is retried against a fresh path. Non-corruption errors and a second
 * corruption failure propagate to the caller.
 */
export function openSqliteWithRecovery<T>(
	dbPath: string,
	open: (path: string) => T,
): T {
	try {
		return open(dbPath);
	} catch (error) {
		if (!isSqliteCorruptionError(error)) {
			throw error;
		}
		console.warn(
			"[persistence] Corrupt SQLite database detected; quarantining and rebuilding:",
			dbPath,
			error,
		);
		quarantineCorruptDatabase(dbPath);
		return open(dbPath);
	}
}
