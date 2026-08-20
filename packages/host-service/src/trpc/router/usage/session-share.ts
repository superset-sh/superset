/**
 * Shares session state between a secondary Claude profile dir and the
 * default `~/.claude` home via symlinks, so every login sees one
 * conversation history — switching accounts stops meaning losing
 * `--resume` and the prompt history.
 *
 * Only surfaces a symlink can survive are shared here: directories, and
 * `history.jsonl`, which the CLI appends to in place. Config files like
 * settings.json and `.claude.json` are written with write-tmp-then-rename —
 * a rename would replace the symlink with a real file and silently fork the
 * config — so those (plus skills, plugins, MCP servers) belong to
 * agent-setup's ledger-based profile provisioning, not to this module.
 * Identity (`.claude.json`, credential stores) and runtime dirs (daemon/,
 * cache/, telemetry/, backups/) always stay per-profile.
 *
 * Existing real state is merged, not clobbered. Session trees are renamed
 * aside, the symlink lands immediately, and files then move into `~/.claude`
 * one by one: renames preserve inodes, so a live session's open transcripts
 * stay valid and its paths resolve through the new link. The prompt history
 * is appended. Anything that cannot merge safely is left where it is.
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
	unlinkSync,
} from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";

/** Session-scoped state keyed by session UUID or cwd slug: safe to merge
 * file-by-file, since two profiles' sessions collide no more than two
 * concurrent sessions in one dir already do. */
const SESSION_DIRS = [
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
];

const MERGE_SUFFIX = ".superset-merge";

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
): string | null {
	const resolved = canonical(configDir);
	const home = homedir();
	const excluded = new Set(
		[
			home,
			join(home, ".claude"),
			join(home, ".config"),
			join(home, ".config", "claude"),
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

function mergeAndLinkSessionDir(
	profile: string,
	main: string,
	name: string,
): void {
	const src = join(profile, name);
	const dst = join(main, name);
	const pending = `${src}${MERGE_SUFFIX}`;
	// Finish what an interrupted earlier merge left behind before anything
	// else — src may already be a symlink by now.
	if (lstatOrNull(pending)?.isDirectory()) {
		mkdirSync(dst, { recursive: true });
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

function mergeAndLinkHistory(profile: string, main: string): void {
	const src = join(profile, "history.jsonl");
	const dst = join(main, "history.jsonl");
	const pending = `${src}${MERGE_SUFFIX}`;
	if (lstatOrNull(pending)?.isFile()) {
		appendHistoryRecords(dst, readFileSync(pending));
		unlinkSync(pending);
	}
	const info = lstatOrNull(src);
	if (info?.isSymbolicLink()) return;
	if (info && !info.isFile()) return;
	if (!lstatOrNull(dst)) appendFileSync(dst, "");
	if (!info) {
		symlinkSync(dst, src);
		return;
	}
	renameSync(src, pending);
	try {
		symlinkSync(dst, src);
	} catch {
		renameSync(pending, src);
		return;
	}
	appendHistoryRecords(dst, readFileSync(pending));
	unlinkSync(pending);
}

/**
 * Best-effort per entry: one unmergeable path must not stop the rest, and a
 * partially shared profile is strictly better than an unshared one.
 */
export function shareClaudeSessionState(
	configDir: string,
	mainHome: string = join(homedir(), ".claude"),
): void {
	// Windows symlinks need elevation; profiles are a macOS/Linux feature.
	if (platform() === "win32") return;
	const profile = shareableProfileDir(configDir, mainHome);
	if (!profile) return;
	const main = resolve(mainHome);
	const steps: Array<() => void> = [
		...SESSION_DIRS.map(
			(name) => () => mergeAndLinkSessionDir(profile, main, name),
		),
		() => mergeAndLinkHistory(profile, main),
	];
	for (const step of steps) {
		try {
			step();
		} catch {
			// Skipped entry; retried on the next switch to this profile.
		}
	}
}
