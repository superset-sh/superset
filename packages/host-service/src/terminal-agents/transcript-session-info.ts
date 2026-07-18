import { closeSync, openSync, readSync, statSync } from "node:fs";

/**
 * How much of the transcript tail to scan. Session info lives on the last
 * few entries; 256KB comfortably covers even tool-heavy final turns.
 */
const TAIL_BYTES = 256 * 1024;

interface ClaudeUsage {
	input_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
	output_tokens?: number;
}

interface CodexTokenUsage {
	total_tokens?: number;
	reasoning_output_tokens?: number;
}

export interface TranscriptSessionInfo {
	contextUsedTokens?: number;
	/** Effective context window (Codex rollouts report it; Claude does not). */
	contextWindowTokens?: number;
	/** Reasoning effort (Codex rollouts carry it; Claude hooks send it directly). */
	effortLevel?: string;
	/**
	 * Permission/approval mode. Claude transcripts record dedicated
	 * {"type":"permission-mode"} entries on every change (Shift+Tab included);
	 * Codex rollouts carry sandbox_policy/approval_policy on each
	 * turn_context.
	 */
	permissionMode?: string;
}

/**
 * Session info read from an agent transcript. Hooks are the trigger but carry
 * no usage data themselves — they do carry `transcript_path`, and the host
 * service can read the file directly. Reads only the tail and parses
 * backwards; returns undefined when the file is missing, unreadable, or has
 * no usable entries yet (new session, or right after /compact until the next
 * response).
 *
 * Two formats, detected per line:
 * - Claude Code transcripts: assistant entries with `message.usage` — context
 *   in use ≈ fresh input + cache reads/writes of the last usage entry.
 * - Codex rollouts: `token_count` event_msg entries carry usage + the model's
 *   context window, and separate `turn_context` entries carry effort; both
 *   are collected in one backwards pass.
 */
export function readTranscriptSessionInfo(
	transcriptPath: string,
): TranscriptSessionInfo | undefined {
	let tail: string;
	try {
		const size = statSync(transcriptPath).size;
		const start = Math.max(0, size - TAIL_BYTES);
		const buffer = Buffer.alloc(size - start);
		const fd = openSync(transcriptPath, "r");
		try {
			readSync(fd, buffer, 0, buffer.length, start);
		} finally {
			closeSync(fd);
		}
		tail = buffer.toString("utf-8");
	} catch {
		return undefined;
	}

	const lines = tail.split("\n");
	let codexUsage: TranscriptSessionInfo | undefined;
	// Effort comes from the latest turn_context only — an entry that omits
	// `effort` means "default", and must not inherit an older turn's value.
	let sawTurnContext = false;
	let codexEffort: string | undefined;
	let codexPermissionMode: string | undefined;
	let claudeUsage: number | undefined;
	let claudePermissionMode: string | undefined;

	for (let i = lines.length - 1; i >= 0; i--) {
		const line = lines[i];
		if (!line) continue;

		if (codexUsage === undefined && line.includes('"token_count"')) {
			codexUsage = parseCodexTokenCount(line);
		} else if (!sawTurnContext && line.includes('"turn_context"')) {
			const parsed = parseCodexTurnContext(line);
			if (parsed !== undefined) {
				sawTurnContext = true;
				codexEffort = parsed.effortLevel;
				codexPermissionMode = parsed.permissionMode;
			}
		} else if (
			claudePermissionMode === undefined &&
			line.includes('"permission-mode"')
		) {
			claudePermissionMode = parseClaudePermissionMode(line);
		} else if (claudeUsage === undefined && line.includes('"usage"')) {
			claudeUsage = parseClaudeUsage(line);
		}

		if (codexUsage !== undefined && sawTurnContext) break;
		if (claudeUsage !== undefined && claudePermissionMode !== undefined) break;
	}

	if (claudeUsage !== undefined || claudePermissionMode !== undefined) {
		return {
			...(claudeUsage !== undefined ? { contextUsedTokens: claudeUsage } : {}),
			...(claudePermissionMode !== undefined
				? { permissionMode: claudePermissionMode }
				: {}),
		};
	}

	if (
		codexUsage === undefined &&
		codexEffort === undefined &&
		codexPermissionMode === undefined
	) {
		return undefined;
	}
	return {
		...codexUsage,
		...(codexEffort !== undefined ? { effortLevel: codexEffort } : {}),
		...(codexPermissionMode !== undefined
			? { permissionMode: codexPermissionMode }
			: {}),
	};
}

function parseClaudePermissionMode(line: string): string | undefined {
	try {
		const entry = JSON.parse(line) as {
			type?: string;
			permissionMode?: string;
		};
		if (entry.type !== "permission-mode") return undefined;
		return typeof entry.permissionMode === "string"
			? entry.permissionMode
			: undefined;
	} catch {
		return undefined;
	}
}

function parseClaudeUsage(line: string): number | undefined {
	try {
		const entry = JSON.parse(line) as {
			message?: { usage?: ClaudeUsage };
		};
		const usage = entry.message?.usage;
		if (!usage || typeof usage.input_tokens !== "number") return undefined;
		return (
			usage.input_tokens +
			(usage.cache_creation_input_tokens ?? 0) +
			(usage.cache_read_input_tokens ?? 0)
		);
	} catch {
		// Truncated first line of the tail window or a non-JSON line.
		return undefined;
	}
}

function parseCodexTokenCount(line: string): TranscriptSessionInfo | undefined {
	try {
		const entry = JSON.parse(line) as {
			type?: string;
			payload?: {
				type?: string;
				info?: {
					last_token_usage?: CodexTokenUsage;
					model_context_window?: number;
				};
			};
		};
		if (entry.type !== "event_msg" || entry.payload?.type !== "token_count") {
			return undefined;
		}
		const info = entry.payload.info;
		const usage = info?.last_token_usage;
		if (!usage || typeof usage.total_tokens !== "number") return undefined;
		// Codex's own context meter appears to exclude reasoning output from
		// what occupies the window; subtracting reasoning_output_tokens matches
		// it best (medium confidence — checked against Codex 0.144.5).
		return {
			contextUsedTokens:
				usage.total_tokens - (usage.reasoning_output_tokens ?? 0),
			...(typeof info?.model_context_window === "number"
				? { contextWindowTokens: info.model_context_window }
				: {}),
		};
	} catch {
		return undefined;
	}
}

function parseCodexTurnContext(
	line: string,
): { effortLevel?: string; permissionMode?: string } | undefined {
	try {
		const entry = JSON.parse(line) as {
			type?: string;
			payload?: {
				effort?: string;
				collaboration_mode?: { settings?: { reasoning_effort?: string } };
				sandbox_policy?: { type?: string };
				approval_policy?: string;
			};
		};
		if (entry.type !== "turn_context") return undefined;
		// `effort` is absent when default; collaboration_mode settings are the
		// secondary source before concluding the turn runs at default effort.
		const effort =
			entry.payload?.effort ??
			entry.payload?.collaboration_mode?.settings?.reasoning_effort;
		// sandbox_policy.type (read-only | workspace-write | danger-full-access)
		// is the user-facing mode; approval_policy is the fallback signal.
		const permissionMode =
			entry.payload?.sandbox_policy?.type ?? entry.payload?.approval_policy;
		return {
			...(typeof effort === "string" ? { effortLevel: effort } : {}),
			...(typeof permissionMode === "string" ? { permissionMode } : {}),
		};
	} catch {
		return undefined;
	}
}
