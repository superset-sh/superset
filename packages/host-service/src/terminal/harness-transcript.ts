import {
	closeSync,
	existsSync,
	openSync,
	readdirSync,
	readSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";

/**
 * Read a session transcript from the harness's own store when it keeps one.
 *
 * The PTY stream is the universal source, but it is a reconstruction: rows as
 * they were painted, capped by a retention ring, with tool output and UI
 * chrome interleaved. A harness that already writes its conversation to disk
 * has the same content structured, complete, and free of redraw artefacts, so
 * prefer it where it exists and fall back to the stream everywhere else.
 */

/** Newest turns first would invert the conversation; keep source order. */
const MAX_HARNESS_TRANSCRIPT_CHARS = 400_000;
/**
 * Bytes read off the end of a session file. A long-running session's JSONL
 * runs to megabytes (this repo's own dev session reached 3.9 MB), and the
 * host must not load, split, and parse all of it on the event loop to answer
 * one handoff. Generous next to the character cap the turns are trimmed to.
 */
const MAX_HARNESS_SOURCE_BYTES = 4 * 1024 * 1024;

export interface HarnessTranscript {
	text: string;
	/** Which harness store answered, for the caller to report. */
	harness: "claude";
}

/**
 * Claude Code stores one JSONL file per session under a directory named after
 * the working directory with every `/` and `.` replaced by `-`.
 */
function claudeTranscriptPath(
	worktreePath: string,
	sessionId: string,
	configDir: string,
): string | null {
	if (!/^[\w-]+$/.test(sessionId)) return null;
	const encoded = worktreePath.replaceAll(/[/.]/g, "-");
	const path = join(configDir, "projects", encoded, `${sessionId}.jsonl`);
	return existsSync(path) ? path : null;
}

/**
 * Where a harness keeps its sessions for a given launch. An agent pinned to
 * its own provider account carries `CLAUDE_CONFIG_DIR` / `CODEX_HOME`, and
 * looking in the default location instead would report a live session as
 * missing — the preflight would then refuse a fork that would have worked.
 */
function claudeConfigDir(env: HarnessEnv): string {
	return env?.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
}

function codexHome(env: HarnessEnv): string {
	return env?.CODEX_HOME?.trim() || join(homedir(), ".codex");
}

export type HarnessEnv = Record<string, string | undefined> | undefined;

/**
 * The last `maxBytes` of a file. A cut lands mid-line, and the parser already
 * skips lines it cannot parse, so the only casualty is the oldest turn.
 */
export function readFileTail(path: string, maxBytes: number): string | null {
	let fd: number | undefined;
	try {
		const { size } = statSync(path);
		const length = Math.min(size, maxBytes);
		const buffer = Buffer.allocUnsafe(length);
		fd = openSync(path, "r");
		// A short read would otherwise leave uninitialised heap in the tail,
		// which then gets decoded and shipped into another agent's prompt.
		const read = readSync(fd, buffer, 0, length, Math.max(0, size - length));
		return buffer.subarray(0, Math.max(0, read)).toString("utf8");
	} catch {
		return null;
	} finally {
		if (fd !== undefined) {
			try {
				closeSync(fd);
			} catch {
				// best effort
			}
		}
	}
}

interface ClaudeEvent {
	type?: string;
	message?: {
		role?: string;
		content?: string | Array<{ type?: string; text?: string }>;
	};
}

function textOf(event: ClaudeEvent): string | null {
	const content = event.message?.content;
	if (typeof content === "string") return content.trim() || null;
	if (!Array.isArray(content)) return null;
	const parts = content
		.filter((block) => block.type === "text" && block.text)
		.map((block) => (block.text ?? "").trim())
		.filter(Boolean);
	return parts.length > 0 ? parts.join("\n") : null;
}

function readClaudeTranscript(
	worktreePath: string,
	sessionId: string,
	configDir: string,
): string | null {
	const path = claudeTranscriptPath(worktreePath, sessionId, configDir);
	if (!path) return null;
	const raw = readFileTail(path, MAX_HARNESS_SOURCE_BYTES);
	if (raw === null) return null;

	const turns: string[] = [];
	for (const line of raw.split("\n")) {
		if (!line) continue;
		let event: ClaudeEvent;
		try {
			event = JSON.parse(line) as ClaudeEvent;
		} catch {
			continue; // a partially written final line while the session runs
		}
		if (event.type !== "user" && event.type !== "assistant") continue;
		const text = textOf(event);
		if (!text) continue;
		turns.push(`${event.type === "user" ? "User" : "Assistant"}: ${text}`);
	}
	if (turns.length === 0) return null;

	const joined = turns.join("\n\n");
	return joined.length > MAX_HARNESS_TRANSCRIPT_CHARS
		? joined.slice(-MAX_HARNESS_TRANSCRIPT_CHARS)
		: joined;
}

/**
 * The harness's own transcript for a bound session, or null when the harness
 * keeps none, the id is unknown, or the file cannot be read.
 */
export function readHarnessTranscript(input: {
	agentId: string | null | undefined;
	agentSessionId: string | null | undefined;
	worktreePath: string | null | undefined;
	/** The launch env, so a pinned provider account is read from its own dir. */
	env?: HarnessEnv;
}): HarnessTranscript | null {
	const { agentId, agentSessionId, worktreePath } = input;
	if (!agentId || !agentSessionId || !worktreePath) return null;
	if (agentId !== "claude") return null;
	const text = readClaudeTranscript(
		worktreePath,
		agentSessionId,
		claudeConfigDir(input.env),
	);
	return text ? { text, harness: "claude" } : null;
}

/**
 * Whether the harness can still resolve a session id.
 *
 * `true` and `false` are answers; `null` means this harness keeps its sessions
 * somewhere we cannot inspect (a server, an unknown layout) and the caller
 * must not treat that as absence.
 *
 * Forking a session the provider has pruned fails inside the freshly launched
 * pane, as the harness's own error, long after the click that asked for it.
 * Checking first turns that into a refusal at the point of asking.
 */
export function hasHarnessSession(input: {
	agentId: string | null | undefined;
	sessionId: string | null | undefined;
	worktreePath: string | null | undefined;
	/** The launch env, so a pinned provider account is read from its own dir. */
	env?: HarnessEnv;
}): boolean | null {
	const { agentId, sessionId, worktreePath } = input;
	if (!agentId || !sessionId) return null;
	if (!/^[\w-]+$/.test(sessionId)) return null;

	try {
		switch (agentId) {
			case "claude": {
				if (!worktreePath) return null;
				const configDir = claudeConfigDir(input.env);
				if (!existsSync(configDir)) return null;
				// Only a project directory we can see makes an absent session
				// file evidence. The agent may have been started in a
				// subdirectory, or Claude may encode the path differently than
				// this does, and neither means the session is gone.
				const projectDir = join(
					configDir,
					"projects",
					worktreePath.replaceAll(/[/.]/g, "-"),
				);
				if (!existsSync(projectDir)) return null;
				return (
					claudeTranscriptPath(worktreePath, sessionId, configDir) !== null
				);
			}
			case "codex":
				return hasCodexRollout(sessionId, codexHome(input.env));
			case "opencode":
				return hasOpencodeSession(sessionId);
			case "pi":
				return hasPiSession(sessionId);
			default:
				// grok keeps sessions server-side; the rest are unsurveyed.
				return null;
		}
	} catch {
		// An unreadable store is not evidence the session is gone.
		return null;
	}
}

/** Codex names rollouts `rollout-<timestamp>-<session id>.jsonl`, in date dirs. */
function hasCodexRollout(sessionId: string, home: string): boolean | null {
	const root = join(home, "sessions");
	if (!existsSync(root)) return null;
	const suffix = `-${sessionId}.jsonl`;
	const stack = [root];
	// Date-partitioned three deep (year/month/day); bounded so a pathological
	// tree cannot turn a dialog into a filesystem walk.
	let visited = 0;
	while (stack.length > 0 && visited < 2000) {
		const dir = stack.pop();
		if (!dir) break;
		visited++;
		for (const entry of readdirSync(dir, { withFileTypes: true })) {
			if (entry.isDirectory()) {
				stack.push(join(dir, entry.name));
			} else if (entry.name.endsWith(suffix)) {
				return true;
			}
		}
	}
	return visited >= 2000 ? null : false;
}

/**
 * pi files sessions per working directory, one JSONL each, named
 * `<timestamp>_<session id>.jsonl`. Matching on the id suffix avoids
 * reproducing its directory-name encoding of the cwd.
 */
function hasPiSession(sessionId: string): boolean | null {
	const root = join(homedir(), ".pi", "agent", "sessions");
	if (!existsSync(root)) return null;
	const suffix = `_${sessionId}.jsonl`;
	let visited = 0;
	for (const dir of readdirSync(root, { withFileTypes: true })) {
		if (!dir.isDirectory()) continue;
		if (visited++ > 2000) return null;
		for (const entry of readdirSync(join(root, dir.name))) {
			if (entry.endsWith(suffix)) return true;
		}
	}
	return false;
}

/** OpenCode keeps sessions in a SQLite database in its data directory. */
function hasOpencodeSession(sessionId: string): boolean | null {
	const dbPath = join(homedir(), ".local", "share", "opencode", "opencode.db");
	if (!existsSync(dbPath)) return null;
	// better-sqlite3, not `bun:sqlite`: the host service runs under Electron's
	// Node, where a Bun built-in does not exist and the import crashes the
	// process on boot.
	//
	// Read-only, but NOT `immutable`: that flag ignores the write-ahead log, so
	// a session written moments ago reads as absent.
	const db = new Database(dbPath, { readonly: true });
	try {
		const row = db
			.prepare("select 1 from session where id = ? limit 1")
			.get(sessionId);
		return row !== null && row !== undefined;
	} finally {
		db.close();
	}
}
