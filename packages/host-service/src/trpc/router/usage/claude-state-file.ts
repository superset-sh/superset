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
import { basename, dirname, join, resolve } from "node:path";

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
 * One in-flight update per state path. POSIX has no compare-and-rename, so the
 * fingerprint check cannot close the window between itself and the rename:
 * two updates that read the same bytes both see an unchanged file and the
 * second rename silently drops the first's mutation. Superset's own writers (a
 * trust seed, a swap, the engine's identity re-assertion) are serialized here
 * so they never interleave within one host-service; the running Claude Code
 * CLI is outside this chain, which is what the fingerprint retry is for.
 */
const updateChains = new Map<string, Promise<void>>();

function withStateFileLock<T>(
	statePath: string,
	run: () => Promise<T>,
): Promise<T> {
	// `resolve`, not `realpath`: the file need not exist yet, and every caller
	// names it by an absolute path already.
	const key = resolve(statePath);
	const result = (updateChains.get(key) ?? Promise.resolve()).then(run);
	// The queued promise must never reject — a failed update must not fail the
	// next one — and the entry is dropped once nothing is waiting behind it.
	const settled = result.then(
		() => {},
		() => {},
	);
	updateChains.set(key, settled);
	void settled.then(() => {
		if (updateChains.get(key) === settled) updateChains.delete(key);
	});
	return result;
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

/** A copy of the unparsable bytes, written but not yet announced: the caller
 * decides. Splitting it this way keeps the fingerprint check the last thing
 * before the rename — announcing and pruning inline put milliseconds of
 * directory I/O inside that window, and a writer settling in there had its
 * bytes replaced by a mutation of empty state. */
type RescuedBytes = {
	/** Announce the rescue and prune the dir down to three. */
	commit: () => Promise<void>;
	/** Take the copy back: the attempt is being retried, so nothing was
	 * discarded and nothing should be announced or pruned. */
	abandon: () => Promise<void>;
};

/** One 0600 timestamped copy of the bytes this write is about to discard,
 * three kept per dir. */
async function backupUnparsableState(
	statePath: string,
	raw: string,
): Promise<RescuedBytes> {
	const stamp = new Date().toISOString().replace(/[:.]/g, "-");
	const backupPath = `${statePath}.${stamp}.${randomUUID()}${BACKUP_MARKER}`;
	// The uuid keeps two rescues in the same millisecond apart: sharing a name,
	// the second would fail EEXIST and its bytes would be dropped as though the
	// first backup already held them. The stamp still leads, so the names sort
	// oldest-first for the prune below.
	await writeFile(backupPath, raw, {
		mode: 0o600,
		flag: "wx",
	});
	return {
		commit: () => announceRescue(statePath, backupPath),
		// Best-effort: a copy that cannot be taken back is untidy, not a
		// reason to fail an update that has not written anything yet.
		abandon: () => unlink(backupPath).catch(() => {}),
	};
}

async function announceRescue(
	statePath: string,
	backupPath: string,
): Promise<void> {
	// Only once the copy exists — a full or read-only home makes the write
	// throw, and announcing a path that was never created would send the user
	// looking for a file that is not there. Only once the write is committing,
	// too, so the message is never a false alarm about a file that turned out
	// to be fine. Discarding the live state used to say nothing at all, while
	// failing to prune an old rescue already warned.
	console.warn(
		`Superset could not parse ${statePath}; a copy of its contents was saved to ${backupPath}.`,
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

/** Mtime, inode and size of the file this write is replacing, or null when
 * there is none — the fingerprint a concurrent writer changes.
 *
 * Nanoseconds, not `mtimeMs`: the plain Stats field is truncated to whole
 * milliseconds, and a read-modify-write cycle here is far shorter than that,
 * so a concurrent same-size rewrite landed in the same bucket and the guard
 * waved it through. The inode is in it too, because the writer we race is the
 * Claude Code CLI and an atomic writer replaces the file rather than editing
 * it in place — a new inode is the one signal that survives any clock. */
async function stateFingerprint(statePath: string): Promise<string | null> {
	try {
		const info = await stat(statePath, { bigint: true });
		return `${info.mtimeNs}:${info.ino}:${info.size}`;
	} catch (error) {
		if (errorCode(error) === "ENOENT") return null;
		throw error;
	}
}

/** Writes the mutated state, unless the file changed since `before` — in
 * which case the caller has to re-read and re-apply, since this snapshot no
 * longer has the other writer's bytes in it. `rescue`, when the read was
 * unparsable, writes its copy in the one moment those bytes are known to be
 * lost: past the fingerprint check, so an abandoned attempt never copies
 * anything, and still before the rename, so a rescue that cannot be written
 * aborts the update with the corrupt file intact. Only the copy happens
 * there — announcing and pruning wait until the fingerprint has had the last
 * word. */
async function writeIfUnchanged(
	statePath: string,
	next: ClaudeState,
	before: string | null,
	rescue?: () => Promise<RescuedBytes>,
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
		const rescued = await rescue?.();
		// Writing the copy is directory I/O, so the file can settle while it
		// runs — and the tmp file already holds a mutation of empty state,
		// which would sign the user out and drop every folder-trust entry the
		// settling writer had just saved. The check goes last, with nothing
		// but the rename behind it.
		if ((await stateFingerprint(statePath)) !== before) {
			await rescued?.abandon();
			await unlink(temporaryPath).catch(() => {});
			return false;
		}
		await rename(temporaryPath, statePath);
		await rescued?.commit();
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
 * read-modify-write is guarded twice: Superset's own writers queue behind each
 * other per path, and against the CLI — which cannot be serialized — the file
 * is fingerprinted before the read and again right before the rename, and a
 * file that moved in between is re-read and the mutation re-applied rather
 * than replaced with the older snapshot, which would sign the user out or drop
 * every folder-trust entry written since the read.
 */
export async function updateClaudeStateFile(
	statePath: string,
	mutate: (state: ClaudeState) => ClaudeState,
): Promise<void> {
	return withStateFileLock(statePath, () =>
		applyStateUpdate(statePath, mutate),
	);
}

async function applyStateUpdate(
	statePath: string,
	mutate: (state: ClaudeState) => ClaudeState,
): Promise<void> {
	for (let attempt = 1; ; attempt++) {
		const before = await stateFingerprint(statePath);
		let state: ClaudeState = {};
		let rescue: (() => Promise<RescuedBytes>) | undefined;
		const raw = await readExistingState(statePath);
		if (raw !== null && raw.trim() !== "") {
			const parsed = parseState(raw);
			if (parsed) state = parsed;
			// Held, not written yet: only bytes this attempt actually replaces
			// are worth rescuing. A non-atomic CLI write can settle any time
			// up to the rename, and the retry then writes the file whole, so
			// copying at the read would leave a permanent backup of a torn
			// read nothing ever lost, warn about a file that was fine, and
			// spend one of the three slots — three of them evict the genuine
			// rescue of a truly corrupt file.
			else rescue = () => backupUnparsableState(statePath, raw);
		}
		if (await writeIfUnchanged(statePath, mutate(state), before, rescue))
			return;
		if (attempt >= MAX_ATTEMPTS) {
			throw new Error(
				`${statePath} kept changing while Superset updated it; no write was made`,
			);
		}
	}
}
