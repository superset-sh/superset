import type { UsageLogEntry } from "./parse";
import { num } from "./parse";

/** One assistant message as OpenCode stores it — the JSON file body in the
 * legacy storage tree, the `data` column in `opencode.db`. */
export interface OpencodeMessage {
	sessionID?: string;
	role?: string;
	time?: { created?: number; completed?: number };
	modelID?: string;
	providerID?: string;
	path?: { cwd?: string };
	cost?: number;
	tokens?: {
		input?: number;
		output?: number;
		reasoning?: number;
		cache?: { read?: number; write?: number };
	};
}

/** Tokens are normalized by OpenCode itself: `input` is already the
 * non-cached share, and `cost` is the real USD it computed for the call. */
export function opencodeMessageToEntry(
	message: OpencodeMessage,
	sessionId: string,
	cutoffMs: number,
): UsageLogEntry | null {
	if (message.role !== "assistant") return null;
	const timestampMs = num(message.time?.completed ?? message.time?.created);
	if (!timestampMs || timestampMs < cutoffMs) return null;
	const tokens = message.tokens;
	if (!tokens) return null;
	const uncachedInput = num(tokens.input);
	const cachedInput = num(tokens.cache?.read);
	const cacheWrite = num(tokens.cache?.write);
	const output = num(tokens.output);
	if (uncachedInput + cachedInput + cacheWrite + output === 0) return null;
	const cost = num(message.cost);
	return {
		agent: "opencode",
		model: message.modelID || "unknown",
		timestampMs,
		cwd: typeof message.path?.cwd === "string" ? message.path.cwd : null,
		sessionId,
		uncachedInput,
		cachedInput,
		cacheWrite5m: cacheWrite,
		cacheWrite1h: 0,
		output,
		reasoningOutput: num(tokens.reasoning),
		...(cost > 0 ? { costUsd: cost } : {}),
	};
}

export interface OpencodeMessageRow {
	session_id: string | null;
	data: string | null;
	directory: string | null;
	title: string | null;
}

export function opencodeRowsToEntries(
	rows: OpencodeMessageRow[],
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): void {
	for (const row of rows) {
		if (!row.data) continue;
		let message: OpencodeMessage;
		try {
			message = JSON.parse(row.data);
		} catch {
			continue;
		}
		const sessionId = row.session_id ?? "unknown";
		const entry = opencodeMessageToEntry(message, sessionId, cutoffMs);
		if (!entry) continue;
		// The session row's directory covers messages written before OpenCode
		// stamped a cwd on each message.
		if (!entry.cwd && row.directory) entry.cwd = row.directory;
		if (row.title && sessionLabels && !sessionLabels.has(sessionId)) {
			sessionLabels.set(sessionId, row.title);
		}
		out.push(entry);
	}
}
