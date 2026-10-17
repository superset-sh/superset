import type { UsageLogEntry } from "./parse";
import { num } from "./parse";

/** One assistant message as OpenCode stores it — the JSON file body in the
 * legacy storage tree, the `data` column in `opencode.db`. V2 drops `role`
 * (the row's `type` holds it) and nests the model under `model`. */
export interface OpencodeMessage {
	sessionID?: string;
	role?: string;
	time?: { created?: number; completed?: number };
	modelID?: string;
	providerID?: string;
	model?: { id?: string; providerID?: string };
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
		model: message.modelID || message.model?.id || "unknown",
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
	/** V2 `session_message.type`; V1 rows keep the role in `data`. */
	type?: string | null;
	data: string | null;
	directory: string | null;
	title: string | null;
}

/** The part of a better-sqlite3 or bun:sqlite database the reader needs. */
export interface OpencodeDb {
	prepare(sql: string): {
		get(...params: unknown[]): unknown;
		all(...params: unknown[]): unknown[];
	};
}

const V1_QUERY = `SELECT m.session_id, m.data, s.directory, s.title
	FROM message m
	LEFT JOIN session s ON s.id = m.session_id
	WHERE m.time_created >= ?
	  AND json_extract(m.data, '$.role') = 'assistant'`;

// V2 imports V1 messages with their IDs once; later V1 writes stay behind.
const V1_NOT_IMPORTED_QUERY = `${V1_QUERY}
	  AND NOT EXISTS (SELECT 1 FROM session_message v WHERE v.id = m.id)`;

// A fork holds copies of its parent's earlier messages. They are the only
// record of that spend once the parent is deleted.
const V2_QUERY = `SELECT m.session_id, m.type, m.data, s.directory, s.title
	FROM session_message m
	LEFT JOIN session_v2 s ON s.id = m.session_id
	WHERE m.time_created >= ?
	  AND m.type = 'assistant'
	  AND NOT (
	    s.fork_session_id IS NOT NULL
	    AND m.time_created < s.time_created
	    AND EXISTS (SELECT 1 FROM session_v2 p WHERE p.id = s.fork_session_id)
	  )`;

/** V1 keeps messages in `message` and `session`; V2 in `session_message` and
 * `session_v2`, next to the V1 tables it imported. */
export function readOpencodeMessageRows(
	db: OpencodeDb,
	cutoffMs: number,
): OpencodeMessageRow[] {
	const hasTable = (name: string) =>
		Boolean(
			db
				.prepare(
					"SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
				)
				.get(name),
		);
	const isV2 = hasTable("session_message");
	const rows: OpencodeMessageRow[] = [];
	if (isV2) {
		rows.push(...(db.prepare(V2_QUERY).all(cutoffMs) as OpencodeMessageRow[]));
	}
	if (hasTable("message")) {
		const query = isV2 ? V1_NOT_IMPORTED_QUERY : V1_QUERY;
		rows.push(...(db.prepare(query).all(cutoffMs) as OpencodeMessageRow[]));
	}
	return rows;
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
		if (!message || typeof message !== "object") continue;
		if (row.type && !message.role) message.role = row.type;
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
