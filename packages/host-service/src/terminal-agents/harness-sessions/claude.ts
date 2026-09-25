import { existsSync, readdirSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { isFile } from "./is-file";
import type {
	HarnessEnv,
	HarnessSessionFiles,
	HarnessSessionQuery,
	HarnessSessionStore,
} from "./types";

/**
 * Claude Code names a session's project directory after its working directory
 * (resolved through symlinks, NFC-normalized) with every non-alphanumeric
 * UTF-16 code unit replaced by `-`, and past 200 characters truncates it and
 * appends a hash of the full path.
 */
const PROJECT_DIR_MAX_LENGTH = 200;
/** Project directories scanned when looking a session up by id alone. */
const MAX_PROJECT_DIRS_SCANNED = 5000;

function projectPathHash(path: string): string {
	let hash = 0;
	for (let i = 0; i < path.length; i++) {
		hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0;
	}
	return Math.abs(hash).toString(36);
}

export function claudeProjectDirName(worktreePath: string): string {
	const path = worktreePath.normalize("NFC");
	const encoded = path.replaceAll(/[^a-zA-Z0-9]/g, "-");
	if (encoded.length <= PROJECT_DIR_MAX_LENGTH) return encoded;
	return `${encoded.slice(0, PROJECT_DIR_MAX_LENGTH)}-${projectPathHash(path)}`;
}

function configDir(env: HarnessEnv): string {
	return env?.CLAUDE_CONFIG_DIR?.trim() || join(homedir(), ".claude");
}

function projectDir(env: HarnessEnv, worktreePath: string): string {
	let resolved = worktreePath;
	try {
		resolved = realpathSync(worktreePath);
	} catch {}
	return join(configDir(env), "projects", claudeProjectDirName(resolved));
}

function sessionFileName(sessionId: string): string {
	return `${sessionId}.jsonl`;
}

/**
 * Session ids are UUIDs, so `<id>.jsonl` in any project directory is the
 * session, wherever the agent started and however a future Claude names the
 * directory. `complete` is false when the scan hit its cap, and a miss then
 * proves nothing.
 */
function searchProjects(
	env: HarnessEnv,
	fileName: string,
): { path: string | null; complete: boolean } {
	const projectsDir = join(configDir(env), "projects");
	let entries: string[];
	try {
		entries = readdirSync(projectsDir);
	} catch {
		return { path: null, complete: false };
	}
	for (const entry of entries.slice(0, MAX_PROJECT_DIRS_SCANNED)) {
		const candidate = join(projectsDir, entry, fileName);
		if (isFile(candidate)) return { path: candidate, complete: true };
	}
	return {
		path: null,
		complete: entries.length <= MAX_PROJECT_DIRS_SCANNED,
	};
}

function layoutPath(query: HarnessSessionQuery): string | null {
	if (!query.worktreePath) return null;
	const path = join(
		projectDir(query.env, query.worktreePath),
		sessionFileName(query.sessionId),
	);
	return isFile(path) ? path : null;
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

function parseTurns(raw: string): string[] {
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

const claudeSessionFiles: HarnessSessionFiles = {
	isSessionFile: (path, sessionId) =>
		basename(path) === sessionFileName(sessionId),

	locate: (query) =>
		layoutPath(query) ??
		searchProjects(query.env, sessionFileName(query.sessionId)).path,

	parseTurns,
};

export const claudeSessionStore: HarnessSessionStore = {
	files: claudeSessionFiles,

	hasSession(query) {
		if (!existsSync(configDir(query.env))) return null;
		if (layoutPath(query)) return true;
		const search = searchProjects(query.env, sessionFileName(query.sessionId));
		if (search.path) return true;
		// Absence is evidence only when the whole store was searched and the
		// worktree's own project directory is there to have held the file.
		if (!search.complete || !query.worktreePath) return null;
		return existsSync(projectDir(query.env, query.worktreePath)) ? false : null;
	},
};
