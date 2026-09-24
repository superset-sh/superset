import {
	closeSync,
	existsSync,
	openSync,
	readdirSync,
	readSync,
	realpathSync,
	statSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, isAbsolute, join } from "node:path";
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

/**
 * First bite off the end of a session file. Tool results and screenshots make
 * up most of a Claude JSONL, so a fixed tail can hold only a handful of turns
 * of a session whose whole conversation fits the budget; the read widens from
 * here until the budget is met or the file runs out.
 */
const INITIAL_HARNESS_SOURCE_BYTES = 4 * 1024 * 1024;
/**
 * The read runs synchronously on the host's event loop, so it stops widening
 * here. Past it the oldest turns go unread rather than the host stalling for
 * seconds on a session of hundreds of megabytes.
 */
const MAX_HARNESS_SOURCE_BYTES = 128 * 1024 * 1024;

export interface HarnessTranscript {
	text: string;
	/** Which harness store answered, for the caller to report. */
	harness: "claude";
}

/**
 * Claude Code names a session's project directory after its working directory
 * (resolved through symlinks, NFC-normalized) with every non-alphanumeric
 * UTF-16 code unit replaced by `-`, and past 200 characters truncates it and
 * appends a hash of the full path.
 */
const CLAUDE_PROJECT_DIR_MAX_LENGTH = 200;

function claudeProjectPathHash(path: string): string {
	let hash = 0;
	for (let i = 0; i < path.length; i++) {
		hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0;
	}
	return Math.abs(hash).toString(36);
}

export function claudeProjectDirName(worktreePath: string): string {
	const path = worktreePath.normalize("NFC");
	const encoded = path.replaceAll(/[^a-zA-Z0-9]/g, "-");
	if (encoded.length <= CLAUDE_PROJECT_DIR_MAX_LENGTH) return encoded;
	return `${encoded.slice(0, CLAUDE_PROJECT_DIR_MAX_LENGTH)}-${claudeProjectPathHash(path)}`;
}

function claudeProjectDir(configDir: string, worktreePath: string): string {
	let resolved = worktreePath;
	try {
		resolved = realpathSync(worktreePath);
	} catch {}
	return join(configDir, "projects", claudeProjectDirName(resolved));
}

const SESSION_ID_PATTERN = /^[\w-]+$/;
/** Project directories scanned when looking a session up by id alone. */
const MAX_CLAUDE_PROJECT_DIRS_SCANNED = 5000;

type ClaudeTranscriptSource = "reported" | "encoded" | "search";

/**
 * Where Claude keeps a session's JSONL, most trustworthy answer first:
 *
 * 1. The path Claude's own hook reported (`transcript_path`), which is right
 *    however Claude lays out its store.
 * 2. The directory Claude's current naming scheme gives the worktree.
 * 3. Any project directory holding `<session id>.jsonl`. Session ids are
 *    UUIDs, so a match anywhere is the session, wherever the agent started
 *    and however a future Claude names the directory.
 */
function resolveClaudeTranscript(input: {
	sessionId: string;
	configDir: string;
	worktreePath: string | null | undefined;
	reportedPath: string | null | undefined;
}): { path: string; source: ClaudeTranscriptSource } | null {
	const { sessionId, configDir, worktreePath, reportedPath } = input;
	if (!SESSION_ID_PATTERN.test(sessionId)) return null;
	const fileName = `${sessionId}.jsonl`;

	if (
		reportedPath &&
		isAbsolute(reportedPath) &&
		basename(reportedPath) === fileName &&
		isFile(reportedPath)
	) {
		return { path: reportedPath, source: "reported" };
	}

	if (worktreePath) {
		const encoded = join(claudeProjectDir(configDir, worktreePath), fileName);
		if (isFile(encoded)) return { path: encoded, source: "encoded" };
	}

	const found = findClaudeSessionFile(configDir, fileName);
	return found ? { path: found, source: "search" } : null;
}

function findClaudeSessionFile(
	configDir: string,
	fileName: string,
): string | null {
	const projectsDir = join(configDir, "projects");
	let entries: string[];
	try {
		entries = readdirSync(projectsDir);
	} catch {
		return null;
	}
	for (const entry of entries.slice(0, MAX_CLAUDE_PROJECT_DIRS_SCANNED)) {
		const candidate = join(projectsDir, entry, fileName);
		if (isFile(candidate)) return candidate;
	}
	return null;
}

function isFile(path: string): boolean {
	try {
		return statSync(path).isFile();
	} catch {
		return false;
	}
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
	attachment?: {
		type?: string;
		commandMode?: string;
		prompt?: unknown;
	};
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

function parseClaudeTurns(raw: string): string[] {
	const turns: string[] = [];
	for (const line of raw.split("\n")) {
		if (!line) continue;
		let event: ClaudeEvent;
		try {
			event = JSON.parse(line) as ClaudeEvent;
		} catch {
			continue; // a partially written final line, or one the tail cut
		}
		// Claude records consumed busy-session prompts as attachments. Queue
		// operations alone can describe input the user later removes.
		if (event.type === "attachment") {
			const attachment = event.attachment;
			if (
				attachment?.type === "queued_command" &&
				attachment.commandMode === "prompt" &&
				typeof attachment.prompt === "string" &&
				attachment.prompt.trim()
			) {
				turns.push(`User: ${attachment.prompt.trim()}`);
			}
			continue;
		}
		if (event.type !== "user" && event.type !== "assistant") continue;
		const text = textOf(event);
		if (!text) continue;
		turns.push(`${event.type === "user" ? "User" : "Assistant"}: ${text}`);
	}
	return turns;
}

function readClaudeTranscript(path: string, maxChars: number): string | null {
	let size: number;
	try {
		size = statSync(path).size;
	} catch {
		return null;
	}

	let window = INITIAL_HARNESS_SOURCE_BYTES;
	let joined = "";
	while (true) {
		const raw = readFileTail(path, window);
		if (raw === null) break;
		joined = parseClaudeTurns(raw).join("\n\n");
		if (
			joined.length >= maxChars ||
			window >= size ||
			window >= MAX_HARNESS_SOURCE_BYTES
		) {
			break;
		}
		window = Math.min(window * 4, MAX_HARNESS_SOURCE_BYTES);
	}
	return joined || null;
}

/**
 * The harness's own transcript for a bound session, or null when the harness
 * keeps none, the id is unknown, or the file cannot be read.
 */
export function readHarnessTranscript(input: {
	agentId: string | null | undefined;
	agentSessionId: string | null | undefined;
	worktreePath: string | null | undefined;
	/** Where the harness's own hook said it writes this session, if it did. */
	transcriptPath?: string | null;
	/** The launch env, so a pinned provider account is read from its own dir. */
	env?: HarnessEnv;
	/** Characters of conversation wanted; older turns are read only to fill it. */
	maxChars: number;
}): HarnessTranscript | null {
	const { agentId, agentSessionId } = input;
	if (agentId !== "claude" || !agentSessionId) return null;
	const resolved = resolveClaudeTranscript({
		sessionId: agentSessionId,
		configDir: claudeConfigDir(input.env),
		worktreePath: input.worktreePath,
		reportedPath: input.transcriptPath,
	});
	if (!resolved) {
		// A bound Claude session with no file anywhere means Claude moved its
		// store: the handoff silently degrades to the terminal's last moments.
		console.warn(
			`[harness-transcript] no transcript for claude session ${agentSessionId}; falling back to the terminal stream`,
		);
		return null;
	}
	if (resolved.source !== "reported") {
		console.info(
			`[harness-transcript] claude session ${agentSessionId} found by ${resolved.source} lookup`,
		);
	}
	const text = readClaudeTranscript(resolved.path, input.maxChars);
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
	/** Where the harness's own hook said it writes this session, if it did. */
	transcriptPath?: string | null;
	/** The launch env, so a pinned provider account is read from its own dir. */
	env?: HarnessEnv;
}): boolean | null {
	const { agentId, sessionId, worktreePath } = input;
	if (!agentId || !sessionId) return null;
	if (!SESSION_ID_PATTERN.test(sessionId)) return null;

	try {
		switch (agentId) {
			case "claude": {
				const configDir = claudeConfigDir(input.env);
				if (!existsSync(configDir)) return null;
				const found = resolveClaudeTranscript({
					sessionId,
					configDir,
					worktreePath,
					reportedPath: input.transcriptPath,
				});
				if (found) return true;
				// Only a project directory we can see makes an absent session
				// file evidence; without one, Claude may keep it somewhere we do
				// not know to look.
				if (!worktreePath) return null;
				return existsSync(claudeProjectDir(configDir, worktreePath))
					? false
					: null;
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
