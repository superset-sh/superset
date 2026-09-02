/**
 * Shares session state between a secondary provider profile dir and that
 * provider's default home (`~/.claude`, `~/.codex`) via symlinks, so every
 * login sees one conversation history — switching accounts stops meaning
 * losing `--resume` and the prompt history.
 *
 * Only surfaces a symlink can survive are shared here: directories, and the
 * append-in-place history logs. Config files like settings.json,
 * `.claude.json`, and config.toml are written with write-tmp-then-rename —
 * a rename would replace the symlink with a real file and silently fork the
 * config — so those (plus skills, plugins, MCP servers) belong to
 * agent-setup's ledger-based profile provisioning, not to this module.
 * Identity (`.claude.json`, `auth.json`, credential stores) and runtime dirs
 * (daemon/, cache/, telemetry/, backups/) always stay per-profile.
 *
 * Existing real state is merged, not clobbered. Session trees are renamed
 * aside, the symlink lands immediately, and files then move into the main
 * home one by one: renames preserve inodes, so a live session's open
 * transcripts stay valid and its paths resolve through the new link. The
 * prompt history is appended. A history file the CLI later replaces outright
 * (rename-over-symlink) is re-merged and re-linked on the next provision, so
 * the share is self-healing. Anything that cannot merge safely is left where
 * it is.
 */

import {
	appendFileSync,
	closeSync,
	lstatSync,
	mkdirSync,
	openSync,
	readdirSync,
	readFileSync,
	readSync,
	realpathSync,
	renameSync,
	rmdirSync,
	statSync,
	symlinkSync,
	writeFileSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

/**
 * What one provider keeps that is safe to share. `dirs` are session-scoped
 * state keyed by session UUID or cwd slug: safe to merge file-by-file, since
 * two profiles' sessions collide no more than two concurrent sessions in one
 * dir already do. `historyFiles` are line-delimited logs the CLI appends to
 * in place. `providerHomes` are that provider's own default homes, which are
 * the share's source and so can never be its target.
 */
interface SessionShareSpec {
	dirs: readonly string[];
	historyFiles: readonly string[];
	providerHomes: readonly string[];
}

const CLAUDE_SHARE: SessionShareSpec = {
	dirs: [
		"projects",
		"sessions",
		"session-env",
		"file-history",
		"shell-snapshots",
		"todos",
		"paste-cache",
		"tasks",
		"plans",
		"transcripts",
	],
	historyFiles: ["history.jsonl"],
	providerHomes: [".claude", ".config/claude"],
};

/**
 * Codex keys rollouts by date under `sessions/`, so two accounts' sessions
 * interleave in one tree exactly as two same-day sessions already do, and
 * `codex resume` sees every one of them. `auth.json` stays per-account, and
 * `config.toml` / `AGENTS.md` / `prompts/` belong to agent-setup's ledger
 * (they are rewritten with tmp-then-rename). `shell_snapshots` uses an
 * underscore here; Claude's spells the same dir with a hyphen.
 */
const CODEX_SHARE: SessionShareSpec = {
	dirs: ["sessions", "archived_sessions", "shell_snapshots"],
	historyFiles: ["history.jsonl"],
	// A user-defined CODEX_HOME can make ~/.codex a secondary account. The
	// actual mainHome is excluded separately, so no other fixed home belongs
	// here.
	providerHomes: [],
};

const MERGE_SUFFIX = ".superset-merge";
const HISTORY_OFFSET_SUFFIX = ".offset";

/** Real path when the dir exists (a symlink alias of a protected dir must
 * compare equal to it), plain resolution otherwise. */
function canonical(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		return resolve(path);
	}
}

/** Resolved profile dir, or null when it IS a default home (never share a
 * default home into itself, and never operate on `~`). Compares real paths:
 * a profile dir that is itself a symlink to `~/.claude` would otherwise pass
 * and get linked into itself. */
export function shareableProfileDir(
	configDir: string,
	mainHome: string,
	providerHomes: readonly string[],
): string | null {
	const resolved = canonical(configDir);
	const home = homedir();
	const excluded = new Set(
		[
			home,
			join(home, ".config"),
			...providerHomes.map((relative) => join(home, relative)),
			mainHome,
		].map(canonical),
	);
	return excluded.has(resolved) ? null : resolved;
}

function lstatOrNull(path: string) {
	try {
		return lstatSync(path);
	} catch {
		return null;
	}
}

/** Renames are only atomic within one filesystem. Check before swapping the
 * profile path for a symlink: an EXDEV after that swap would hide the real
 * session tree in the pending directory. */
export function sameFilesystem(
	left: string,
	right: string,
	deviceOf: (path: string) => number | bigint = (path) => statSync(path).dev,
): boolean {
	try {
		return deviceOf(left) === deviceOf(right);
	} catch {
		return false;
	}
}

/**
 * Moves every file under `srcDir` into `dstDir`, creating dirs as needed.
 * Conflicts (a path that already exists in `dstDir`) are left behind in
 * `srcDir`; empty dirs are pruned as the move drains them.
 */
function moveTreeInto(srcDir: string, dstDir: string): void {
	for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
		const from = join(srcDir, entry.name);
		const to = join(dstDir, entry.name);
		if (entry.isDirectory()) {
			const toInfo = lstatOrNull(to);
			if (!toInfo) {
				renameSync(from, to);
				continue;
			}
			if (!toInfo.isDirectory()) continue;
			moveTreeInto(from, to);
		} else if (!lstatOrNull(to)) {
			renameSync(from, to);
		}
	}
	try {
		rmdirSync(srcDir);
	} catch {
		// Conflicts remain — the leftovers stay for the next run to retry.
	}
}

export function mergeAndLinkSessionDir(
	profile: string,
	main: string,
	name: string,
	onSameFilesystem: (left: string, right: string) => boolean = sameFilesystem,
): void {
	const src = join(profile, name);
	const dst = join(main, name);
	const pending = `${src}${MERGE_SUFFIX}`;
	// Finish what an interrupted earlier merge left behind before anything
	// else — src may already be a symlink by now.
	if (lstatOrNull(pending)?.isDirectory()) {
		mkdirSync(dst, { recursive: true });
		if (!onSameFilesystem(pending, dst)) {
			// A prior process may have stopped after the rename but before linking.
			// Put the tree back when cross-device recovery cannot finish, otherwise
			// the CLI's original session path remains missing.
			if (!lstatOrNull(src)) renameSync(pending, src);
			return;
		}
		moveTreeInto(pending, dst);
	}
	const info = lstatOrNull(src);
	if (info?.isSymbolicLink()) return;
	if (info && !info.isDirectory()) return;
	mkdirSync(dst, { recursive: true });
	if (!info) {
		symlinkSync(dst, src);
		return;
	}
	if (!onSameFilesystem(src, dst)) {
		console.warn(
			`[host-service] leaving ${src} unshared because ${dst} is on another filesystem`,
		);
		return;
	}
	// Swap first, merge after: the path is only ever missing for the instant
	// between rename and symlink, and open file handles ride the renames.
	renameSync(src, pending);
	try {
		symlinkSync(dst, src);
	} catch {
		// A live CLI recreated the dir in the gap — restore and skip.
		moveTreeInto(pending, src);
		return;
	}
	moveTreeInto(pending, dst);
}

function historyPendingPaths(profile: string, name: string): string[] {
	const prefix = `${name}${MERGE_SUFFIX}`;
	return readdirSync(profile, { withFileTypes: true })
		.filter((entry) => {
			if (!entry.isFile()) return false;
			if (entry.name === prefix) return true;
			if (!entry.name.startsWith(`${prefix}-`)) return false;
			return /^\d+$/.test(entry.name.slice(prefix.length + 1));
		})
		.map((entry) => entry.name)
		.sort((left, right) => {
			const leftGeneration =
				left === prefix ? 0 : Number(left.slice(prefix.length + 1));
			const rightGeneration =
				right === prefix ? 0 : Number(right.slice(prefix.length + 1));
			return leftGeneration - rightGeneration;
		})
		.map((entry) => join(profile, entry));
}

function nextHistoryPendingPath(src: string): string {
	const base = `${src}${MERGE_SUFFIX}`;
	if (!lstatOrNull(base)) return base;
	for (let generation = 1; ; generation += 1) {
		const candidate = `${base}-${generation}`;
		if (!lstatOrNull(candidate)) return candidate;
	}
}

function readHistoryOffset(pending: string, length: number): number {
	try {
		const parsed = Number.parseInt(
			readFileSync(`${pending}${HISTORY_OFFSET_SUFFIX}`, "utf8"),
			10,
		);
		return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= length
			? parsed
			: 0;
	} catch {
		return 0;
	}
}

/**
 * Copies bytes not imported on an earlier provision, but deliberately keeps
 * the renamed inode and cursor. A CLI may have opened the old history path
 * immediately before the symlink swap; a later append then lands on that
 * inode. Keeping it makes the late write durable, and the next host boot or
 * account switch drains it instead of losing it to an unlink.
 *
 * Cursor updates happen after the append. A crash can therefore duplicate a
 * record on retry, but can never advance past bytes that were not attempted.
 */
function drainPendingHistory(pending: string, dst: string): void {
	const content = readFileSync(pending);
	const offset = readHistoryOffset(pending, content.length);
	appendHistoryRecords(dst, content.subarray(offset));
	writeFileSync(`${pending}${HISTORY_OFFSET_SUFFIX}`, `${content.length}\n`, {
		mode: 0o600,
	});
}

/** Appends line-delimited records, inserting a newline first when the
 * target's last record lacks one (a crash-truncated write) — plain
 * concatenation would fuse the boundary records into one unparsable line. */
function appendHistoryRecords(dst: string, content: Buffer): void {
	if (content.length === 0) return;
	let needsSeparator = false;
	try {
		const size = statSync(dst).size;
		if (size > 0) {
			const tail = Buffer.alloc(1);
			const fd = openSync(dst, "r");
			try {
				readSync(fd, tail, 0, 1, size - 1);
			} finally {
				closeSync(fd);
			}
			needsSeparator = tail[0] !== 0x0a;
		}
	} catch {
		// Missing target — appendFileSync creates it; no separator needed.
	}
	appendFileSync(
		dst,
		needsSeparator ? Buffer.concat([Buffer.from("\n"), content]) : content,
	);
}

function mergeAndLinkHistory(
	profile: string,
	main: string,
	name: string,
): void {
	const src = join(profile, name);
	const dst = join(main, name);
	mkdirSync(main, { recursive: true });
	if (!lstatOrNull(dst)) appendFileSync(dst, "");
	for (const pending of historyPendingPaths(profile, name)) {
		drainPendingHistory(pending, dst);
	}
	const info = lstatOrNull(src);
	if (info?.isSymbolicLink()) return;
	if (info && !info.isFile()) return;
	if (!info) {
		symlinkSync(dst, src);
		return;
	}
	const pending = nextHistoryPendingPath(src);
	renameSync(src, pending);
	try {
		symlinkSync(dst, src);
	} catch {
		renameSync(pending, src);
		return;
	}
	drainPendingHistory(pending, dst);
}

/**
 * Best-effort per entry: one unmergeable path must not stop the rest, and a
 * partially shared profile is strictly better than an unshared one.
 */
function shareSessionState(
	configDir: string,
	mainHome: string,
	spec: SessionShareSpec,
): void {
	// Windows symlinks need elevation; profiles are a macOS/Linux feature.
	if (platform() === "win32") return;
	const profile = shareableProfileDir(configDir, mainHome, spec.providerHomes);
	if (!profile) return;
	const main = resolve(mainHome);
	const steps: Array<() => void> = [
		...spec.dirs.map(
			(name) => () => mergeAndLinkSessionDir(profile, main, name),
		),
		...spec.historyFiles.map(
			(name) => () => mergeAndLinkHistory(profile, main, name),
		),
	];
	for (const step of steps) {
		try {
			step();
		} catch {
			// Skipped entry; retried on the next switch to this profile.
		}
	}
}

/**
 * `mainHome` is required on both of these, with no default aimed at the real
 * `~/.claude` / `~/.codex`. A defaulted one-argument call reads as harmless
 * and is not: it renames the caller's live session trees into their actual
 * home. account-provisioning.ts is the single place that decides what "main"
 * is, and for Codex that answer has to be resolveAmbientCodexHome() rather
 * than a hardcoded `~/.codex`, so the share targets the same home
 * discoverCodexHomes calls the system default.
 */
export function shareClaudeSessionState(
	configDir: string,
	mainHome: string,
): void {
	shareSessionState(configDir, mainHome, CLAUDE_SHARE);
}

/**
 * The Codex twin, so `codex resume` keeps working across an account switch.
 * Without it a switch stranded every rollout in the home the previous account
 * used.
 */
export function shareCodexSessionState(
	codexHome: string,
	mainHome: string,
): void {
	shareSessionState(codexHome, mainHome, CODEX_SHARE);
}
