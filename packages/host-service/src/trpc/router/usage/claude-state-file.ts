/**
 * The one writer of a Claude `.claude.json` state file. Claude Code keeps the
 * account identity, onboarding flag and per-project trust entries in the same
 * object, and a running CLI rewrites it whenever it likes, so every Superset
 * write has to be read-modify-write and atomic: a truncated state file signs
 * the user out and re-prompts every folder trust dialog.
 */

import { randomUUID } from "node:crypto";
import { readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type ClaudeState = Record<string, unknown>;

/** The swap's credential-backup idiom, reused so a state file rescued from an
 * unparsable read lands next to it and is capped the same way. */
const BACKUP_MARKER = ".superset-swap-bak";
const MAX_BACKUPS_PER_DIR = 3;

function errorCode(error: unknown): string | undefined {
	return (error as NodeJS.ErrnoException | null)?.code;
}

/**
 * The file's bytes, or null when there is no file. Every other read failure
 * propagates: an unreadable file is not an empty one, and taking EACCES (or a
 * read that lost a race with the CLI's own rewrite) for "start empty" would
 * replace the user's whole Claude state with the mutation alone.
 */
async function readExistingState(statePath: string): Promise<string | null> {
	try {
		return await readFile(statePath, "utf-8");
	} catch (error) {
		if (errorCode(error) === "ENOENT") return null;
		throw error;
	}
}

function parseState(raw: string): ClaudeState | null {
	try {
		const parsed: unknown = JSON.parse(raw);
		if (
			parsed !== null &&
			typeof parsed === "object" &&
			!Array.isArray(parsed)
		) {
			return parsed as ClaudeState;
		}
	} catch {
		// Not JSON at all.
	}
	return null;
}

/** One 0600 timestamped copy of the bytes this write is about to discard,
 * three kept per dir. */
async function backupUnparsableState(
	statePath: string,
	raw: string,
): Promise<void> {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	try {
		await writeFile(`${statePath}.${stamp}${BACKUP_MARKER}`, raw, {
			mode: 0o600,
			flag: "wx",
		});
	} catch (error) {
		// A backup from this same millisecond already holds these bytes;
		// anything else means the bytes are not safe yet, so do not overwrite.
		if (errorCode(error) !== "EEXIST") throw error;
	}
	try {
		const prefix = `${basename(statePath)}.`;
		const existing = (await readdir(dirname(statePath)))
			.filter((name) => name.startsWith(prefix) && name.endsWith(BACKUP_MARKER))
			.sort();
		for (const name of existing.slice(0, -MAX_BACKUPS_PER_DIR)) {
			await unlink(join(dirname(statePath), name)).catch(() => {});
		}
	} catch {
		// Pruning is best-effort.
	}
}

/**
 * Applies `mutate` to the parsed state file and writes the result back
 * tmp-then-rename, owner-only. A missing file is empty state — the mutation is
 * what the caller cares about, and refusing would strand the swap on a file
 * Claude Code itself would overwrite. A file that exists but does not parse is
 * copied aside first, so the identity and trust entries it held are
 * recoverable rather than destroyed.
 */
export async function updateClaudeStateFile(
	statePath: string,
	mutate: (state: ClaudeState) => ClaudeState,
): Promise<void> {
	let state: ClaudeState = {};
	const raw = await readExistingState(statePath);
	if (raw !== null && raw.trim() !== "") {
		const parsed = parseState(raw);
		if (parsed) state = parsed;
		else await backupUnparsableState(statePath, raw);
	}
	const next = mutate(state);
	const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporaryPath, JSON.stringify(next, null, 2), {
			mode: 0o600,
			flag: "wx",
		});
		await rename(temporaryPath, statePath);
	} catch (error) {
		await unlink(temporaryPath).catch(() => {});
		throw error;
	}
}
