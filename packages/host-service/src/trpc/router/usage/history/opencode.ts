/**
 * OpenCode usage. Since v1.x every session lives in `<data>/opencode/opencode.db`
 * (see opencode-db.ts); older installs left one JSON file per message under
 * `<data>/opencode/storage/message/<sessionID>/msg_*.json` with titles in
 * `storage/session/<projectID>/<ses>.json`. OpenCode migrated that tree into
 * the database, so when the database exists the tree is history already
 * counted and is skipped.
 */

import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { type OpencodeMessage, opencodeMessageToEntry } from "./opencode-rows";
import type { UsageLogEntry } from "./parse";

export function opencodeDataDir(): string {
	const dataHome =
		process.env.XDG_DATA_HOME?.trim() || join(homedir(), ".local", "share");
	return join(dataHome, "opencode");
}

export function opencodeDbPath(dataDir: string = opencodeDataDir()): string {
	return join(dataDir, "opencode.db");
}

export function opencodeStorageDir(
	dataDir: string = opencodeDataDir(),
): string {
	return join(dataDir, "storage");
}

async function readSessionTitles(
	storageDir: string,
	wantedSessions: ReadonlySet<string>,
	sessionLabels: Map<string, string>,
): Promise<void> {
	const sessionRoot = join(storageDir, "session");
	let projectDirs: string[];
	try {
		const entries = await readdir(sessionRoot, { withFileTypes: true });
		projectDirs = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return;
	}
	for (const projectDir of projectDirs) {
		let files: string[];
		try {
			files = await readdir(join(sessionRoot, projectDir));
		} catch {
			continue;
		}
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			const sessionId = file.slice(0, -".json".length);
			if (!wantedSessions.has(sessionId) || sessionLabels.has(sessionId)) {
				continue;
			}
			try {
				const raw = await readFile(
					join(sessionRoot, projectDir, file),
					"utf-8",
				);
				const session = JSON.parse(raw) as { title?: string };
				if (typeof session.title === "string" && session.title) {
					sessionLabels.set(sessionId, session.title);
				}
			} catch {
				// Unreadable session metadata — the entries stay unlabeled.
			}
		}
	}
}

/** Returns the number of message files scanned. */
async function collectLegacyStorageEntries(
	storageDir: string,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): Promise<number> {
	const messageRoot = join(storageDir, "message");
	let sessionDirs: string[];
	try {
		const entries = await readdir(messageRoot, { withFileTypes: true });
		sessionDirs = entries
			.filter((entry) => entry.isDirectory())
			.map((entry) => entry.name);
	} catch {
		return 0;
	}

	let scanned = 0;
	const seenSessions = new Set<string>();
	for (const sessionDir of sessionDirs) {
		const dirPath = join(messageRoot, sessionDir);
		// The mtime of the session's message dir bounds every message inside it
		// — skipping old sessions wholesale keeps the scan cheap on heavy users.
		try {
			if ((await stat(dirPath)).mtimeMs < cutoffMs) continue;
		} catch {
			continue;
		}
		let files: string[];
		try {
			files = await readdir(dirPath);
		} catch {
			continue;
		}
		for (const file of files) {
			if (!file.endsWith(".json")) continue;
			scanned++;
			let message: OpencodeMessage;
			try {
				message = JSON.parse(await readFile(join(dirPath, file), "utf-8"));
			} catch {
				continue;
			}
			const sessionId = message.sessionID ?? sessionDir;
			const entry = opencodeMessageToEntry(message, sessionId, cutoffMs);
			if (!entry) continue;
			seenSessions.add(sessionId);
			out.push(entry);
		}
	}

	if (sessionLabels && seenSessions.size > 0) {
		await readSessionTitles(storageDir, seenSessions, sessionLabels);
	}
	return scanned;
}

/** Returns the number of messages read (database rows or files). */
export async function collectOpencodeEntries(
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
	dataDir: string = opencodeDataDir(),
): Promise<number> {
	const dbPath = opencodeDbPath(dataDir);
	let hasDb = false;
	try {
		hasDb = (await stat(dbPath)).isFile();
	} catch {
		// No database: a pre-1.x install still on the JSON tree.
	}
	if (hasDb) {
		const { collectOpencodeDbEntries } = await import("./opencode-db");
		return collectOpencodeDbEntries(dbPath, cutoffMs, out, sessionLabels);
	}
	return collectLegacyStorageEntries(
		opencodeStorageDir(dataDir),
		cutoffMs,
		out,
		sessionLabels,
	);
}
