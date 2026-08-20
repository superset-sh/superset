import { copyFileSync, existsSync, mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
	type ChromiumProfile,
	listAllChromiumProfiles,
} from "./chromium-profiles";

/**
 * Chrome stores timestamps as microseconds since 1601-01-01 UTC (the Windows
 * FILETIME epoch). This is the offset, in milliseconds, to the Unix epoch.
 */
const CHROME_EPOCH_OFFSET_MS = 11_644_473_600_000;

/** Cap a single import so a huge profile can't stall the transaction. */
const MAX_HISTORY_ROWS = 10_000;

export interface ImportedHistoryEntry {
	url: string;
	title: string;
	visitCount: number;
	lastVisitedAt: number;
}

export interface ChromeUrlRow {
	url: string | null;
	title: string | null;
	visit_count: number | null;
	last_visit_time: number | null;
}

/**
 * Maps raw `urls` rows to history entries, dropping rows without a URL or a
 * real visit time and defaulting missing titles/counts. Pure, so the DB read in
 * {@link readHistoryFromProfile} stays a thin wrapper around it.
 */
export function mapUrlRowsToEntries(
	rows: ChromeUrlRow[],
): ImportedHistoryEntry[] {
	const entries: ImportedHistoryEntry[] = [];
	for (const row of rows) {
		if (!row.url) continue;
		const lastVisitedAt = chromeTimeToUnixMs(row.last_visit_time ?? 0);
		if (lastVisitedAt === null) continue;
		entries.push({
			url: row.url,
			title: row.title ?? "",
			visitCount: row.visit_count ?? 1,
			lastVisitedAt,
		});
	}
	return entries;
}

/**
 * Converts a Chrome `last_visit_time` (microseconds since 1601) to Unix epoch
 * milliseconds. Returns null for the zero/sentinel value Chrome uses for
 * never-visited rows.
 */
export function chromeTimeToUnixMs(chromeMicroseconds: number): number | null {
	if (!Number.isFinite(chromeMicroseconds) || chromeMicroseconds <= 0) {
		return null;
	}
	return Math.round(chromeMicroseconds / 1000) - CHROME_EPOCH_OFFSET_MS;
}

/**
 * Reads a Chromium profile's history. Chrome keeps an exclusive lock on the
 * live `History` database while running, so we copy it (plus any WAL sidecar)
 * to a temp directory and read the copy read-only.
 */
export async function readHistoryFromProfile(
	profileDir: string,
): Promise<ImportedHistoryEntry[]> {
	const source = path.join(profileDir, "History");
	if (!existsSync(source)) return [];

	const tempDir = mkdtempSync(
		path.join(os.tmpdir(), "superset-chrome-import-"),
	);
	const tempDb = path.join(tempDir, "History");

	try {
		copyFileSync(source, tempDb);
		// The WAL/SHM sidecars carry writes not yet checkpointed into the main
		// file; copy them too so we read a consistent, current snapshot.
		for (const suffix of ["-wal", "-shm"]) {
			const sidecar = `${source}${suffix}`;
			if (existsSync(sidecar)) copyFileSync(sidecar, `${tempDb}${suffix}`);
		}

		const db = new Database(tempDb, { readonly: true, fileMustExist: true });
		try {
			const rows = db
				.prepare(
					`SELECT url, title, visit_count, last_visit_time
					 FROM urls
					 WHERE url IS NOT NULL AND last_visit_time > 0
					 ORDER BY last_visit_time DESC
					 LIMIT ?`,
				)
				.all(MAX_HISTORY_ROWS) as ChromeUrlRow[];

			return mapUrlRowsToEntries(rows);
		} finally {
			db.close();
		}
	} finally {
		await rm(tempDir, { recursive: true, force: true });
	}
}

export interface ChromeImportSource {
	/** Absolute profile directory path; also used as the opaque source id. */
	id: string;
	/** Stable browser key, e.g. "chrome", "comet". */
	browserKey: string;
	/** Browser name, e.g. "Google Chrome". */
	browserName: string;
	/** Profile display name, e.g. "Default" or "Work". */
	profileName: string;
}

function toSource(profile: ChromiumProfile): ChromeImportSource {
	return {
		id: profile.profileDir,
		browserKey: profile.browser.key,
		browserName: profile.browser.name,
		profileName: profile.displayName,
	};
}

/**
 * All importable Chromium profiles on this machine, as UI-facing sources.
 */
export function listChromeImportSources(): ChromeImportSource[] {
	return listAllChromiumProfiles().map(toSource);
}

/**
 * Resolves a source id back to its profile directory, but only if it matches a
 * currently-detected profile. This prevents the renderer from asking us to read
 * an arbitrary path via the import mutation.
 */
export function resolveImportSource(id: string): string | null {
	const match = listAllChromiumProfiles().find(
		(profile) => profile.profileDir === id,
	);
	return match ? match.profileDir : null;
}

/**
 * Like {@link resolveImportSource}, but returns the profile directory together
 * with its browser key (needed to find the right Keychain entry for cookies).
 */
export function resolveImportProfile(
	id: string,
): { profileDir: string; browserKey: string } | null {
	const match = listAllChromiumProfiles().find(
		(profile) => profile.profileDir === id,
	);
	return match
		? { profileDir: match.profileDir, browserKey: match.browser.key }
		: null;
}
