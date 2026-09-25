import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type {
	HarnessEnv,
	HarnessSessionFiles,
	HarnessSessionStore,
} from "./types";

/** Directories walked before giving up; bounds a dialog's filesystem cost. */
const MAX_DIRS_VISITED = 2000;

/**
 * Setup Codex sends as user messages: the rendered AGENTS.md, the sandbox
 * and cwd, suggested plugins, and skill bodies. None of it is the user
 * speaking, and each can outweigh the conversation.
 */
const INJECTED_USER_PREFIXES = [
	"# AGENTS.md instructions",
	"<environment_context>",
	"<recommended_plugins>",
	"<skill>",
	"<user_instructions>",
];

function defaultCodexHome(): string {
	return join(homedir(), ".codex");
}

function codexHome(env: HarnessEnv): string {
	return env?.CODEX_HOME?.trim() || defaultCodexHome();
}

/**
 * Codex names rollouts `rollout-<timestamp>-<session id>.jsonl` in
 * `sessions/YYYY/MM/DD/`. Reverting a thread writes a new rollout for the same
 * id with `_<rollout id>` appended, so a thread can own several files; the
 * newest wins, and newest dates are walked first. `complete` is false when
 * the walk hit its cap or the store is missing, and a miss then proves
 * nothing. Compressed rollouts count as the session but cannot be read.
 */
function findRollout(
	home: string,
	sessionId: string,
	{ compressed }: { compressed: boolean },
): { path: string | null; complete: boolean } {
	const root = join(home, "sessions");
	if (!existsSync(root)) return { path: null, complete: false };
	const names = new RegExp(
		`-${sessionId}(?:_[\\w-]+)?\\.jsonl${compressed ? "(?:\\.zst)?" : ""}$`,
	);
	const stack = [root];
	let visited = 0;
	while (stack.length > 0) {
		if (visited++ >= MAX_DIRS_VISITED) return { path: null, complete: false };
		const dir = stack.pop() as string;
		const entries = readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
			b.name.localeCompare(a.name),
		);
		const newest = entries.find(
			(entry) => !entry.isDirectory() && names.test(entry.name),
		);
		if (newest) return { path: join(dir, newest.name), complete: true };
		for (let i = entries.length - 1; i >= 0; i--) {
			const entry = entries[i];
			if (entry?.isDirectory()) stack.push(join(dir, entry.name));
		}
	}
	return { path: null, complete: true };
}

interface CodexItem {
	type?: string;
	role?: string;
	content?: Array<{ type?: string; text?: string }>;
}

function textOf(item: CodexItem): string {
	if (!Array.isArray(item.content)) return "";
	return item.content
		.map((block) =>
			(block.type === "input_text" || block.type === "output_text") &&
			typeof block.text === "string"
				? block.text.trim()
				: "",
		)
		.filter(Boolean)
		.join("\n");
}

function parseTurns(raw: string): string[] {
	const turns: string[] = [];
	for (const line of raw.split("\n")) {
		if (!line) continue;
		let record: { type?: string; payload?: CodexItem } & CodexItem;
		try {
			record = JSON.parse(line);
		} catch {
			continue; // a partially written final line, or one the tail cut
		}
		// Current rollouts wrap items in `response_item`; older ones wrote
		// them bare.
		const item = record.type === "response_item" ? record.payload : record;
		if (item?.type !== "message") continue;
		if (item.role !== "user" && item.role !== "assistant") continue;
		const text = textOf(item);
		if (!text) continue;
		if (
			item.role === "user" &&
			INJECTED_USER_PREFIXES.some((prefix) => text.startsWith(prefix))
		) {
			continue;
		}
		turns.push(`${item.role === "user" ? "User" : "Assistant"}: ${text}`);
	}
	return turns;
}

export const codexSessionFiles: HarnessSessionFiles = {
	/**
	 * The launch env's `CODEX_HOME` first, then the default one: a session
	 * started before the account switched keeps writing where it began.
	 */
	locate({ sessionId, env }) {
		for (const home of new Set([codexHome(env), defaultCodexHome()])) {
			const found = findRollout(home, sessionId, { compressed: false }).path;
			if (found) return found;
		}
		return null;
	},

	parseTurns,
};

export const codexSessionStore: HarnessSessionStore = {
	/** Only the launch env's home: that is where a relaunch will look. */
	hasSession({ sessionId, env }) {
		const home = codexHome(env);
		if (!existsSync(join(home, "sessions"))) return null;
		const search = findRollout(home, sessionId, { compressed: true });
		if (search.path) return true;
		return search.complete ? false : null;
	},
};
