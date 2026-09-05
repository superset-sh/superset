/**
 * The one writer of a Claude `.claude.json` state file. Claude Code keeps the
 * account identity, onboarding flag and per-project trust entries in the same
 * object, and a running CLI rewrites it whenever it likes, so every Superset
 * write has to be read-modify-write and atomic: a truncated state file signs
 * the user out and re-prompts every folder trust dialog.
 */

import { randomUUID } from "node:crypto";
import {
	readdir,
	readFile,
	rename,
	stat,
	unlink,
	writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

export type ClaudeState = Record<string, unknown>;

/** The swap's credential-backup idiom, reused so a state file rescued from an
 * unparsable read lands next to it and is capped the same way. */
const BACKUP_MARKER = ".superset-swap-bak";
const MAX_BACKUPS_PER_DIR = 3;
/** One re-read is enough for the writers that actually collide here (the CLI,
 * a trust seed, a swap); a file changing faster than that is not ours to
 * reconcile silently. */
const MAX_ATTEMPTS = 2;

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
	// The uuid keeps two rescues in the same millisecond apart: sharing a name,
	// the second would fail EEXIST and its bytes would be dropped as though the
	// first backup already held them. The stamp still leads, so the names sort
	// oldest-first for the prune below.
	await writeFile(
		`${statePath}.${stamp}.${randomUUID()}${BACKUP_MARKER}`,
		raw,
		{
			mode: 0o600,
			flag: "wx",
		},
	);
	try {
		const prefix = `${basename(statePath)}.`;
		const existing = (await readdir(dirname(statePath)))
			.filter((name) => name.startsWith(prefix) && name.endsWith(BACKUP_MARKER))
			.sort();
		for (const name of existing.slice(0, -MAX_BACKUPS_PER_DIR)) {
			await unlink(join(dirname(statePath), name));
		}
	} catch (error) {
		// Pruning is best-effort — a backup left behind is not worth failing the
		// write over — but a silent failure hides a dir filling up with them.
		console.warn(
			`Superset could not prune the state-file backups beside ${statePath}:`,
			error,
		);
	}
}

/** Mtime and size of the file this write is replacing, or null when there is
 * none — the fingerprint a concurrent writer changes. */
async function stateFingerprint(statePath: string): Promise<string | null> {
	try {
		const info = await stat(statePath);
		return `${info.mtimeMs}:${info.size}`;
	} catch (error) {
		if (errorCode(error) === "ENOENT") return null;
		throw error;
	}
}

/** Writes the mutated state, unless the file changed since `before` — in
 * which case the caller has to re-read and re-apply, since this snapshot no
 * longer has the other writer's bytes in it. */
async function writeIfUnchanged(
	statePath: string,
	next: ClaudeState,
	before: string | null,
): Promise<boolean> {
	const temporaryPath = `${statePath}.${process.pid}.${randomUUID()}.tmp`;
	try {
		await writeFile(temporaryPath, JSON.stringify(next, null, 2), {
			mode: 0o600,
			flag: "wx",
		});
		if ((await stateFingerprint(statePath)) !== before) {
			await unlink(temporaryPath).catch(() => {});
			return false;
		}
		await rename(temporaryPath, statePath);
		return true;
	} catch (error) {
		await unlink(temporaryPath).catch(() => {});
		throw error;
	}
}

/**
 * Applies `mutate` to the parsed state file and writes the result back
 * tmp-then-rename, owner-only. A missing file is empty state — the mutation is
 * what the caller cares about, and refusing would strand the swap on a file
 * Claude Code itself would overwrite. A file that exists but does not parse is
 * copied aside first, so the identity and trust entries it held are
 * recoverable rather than destroyed.
 *
 * Claude Code, a trust seed and a swap all write this file, so the
 * read-modify-write is guarded: the file is fingerprinted before the read and
 * again right before the rename, and a file that moved in between is re-read
 * and the mutation re-applied rather than replaced with the older snapshot —
 * which would sign the user out or drop every folder-trust entry written since
 * the read.
 */
export async function updateClaudeStateFile(
	statePath: string,
	mutate: (state: ClaudeState) => ClaudeState,
): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		const before = await stateFingerprint(statePath);
		let state: ClaudeState = {};
		const raw = await readExistingState(statePath);
		if (raw !== null && raw.trim() !== "") {
			const parsed = parseState(raw);
			if (parsed) state = parsed;
			else await backupUnparsableState(statePath, raw);
		}
		if (await writeIfUnchanged(statePath, mutate(state), before)) return;
		if (attempt >= MAX_ATTEMPTS) {
			throw new Error(
				`${statePath} kept changing while Superset updated it; no write was made`,
			);
		}
	}
}
