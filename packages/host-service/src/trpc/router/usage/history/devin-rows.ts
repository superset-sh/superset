import type { UsageLogEntry } from "./parse";
import { num } from "./parse";

/** One `message_nodes` row joined to its session, as Devin CLI stores it. */
export interface DevinMessageRow {
	session_id: string | null;
	chat_message: string | null;
	/** Unix seconds. */
	created_at: number | null;
	working_directory: string | null;
	model: string | null;
	title: string | null;
}

interface DevinChatMessage {
	message_id?: string;
	role?: string;
	metadata?: {
		request_id?: string;
		generation_model?: string;
		created_at?: string;
		metrics?: {
			input_tokens?: number;
			output_tokens?: number;
			cache_read_tokens?: number;
			cache_creation_tokens?: number | null;
		};
	};
}

/**
 * Devin writes each assistant message twice (the streamed node and its
 * committed copy share `request_id`), and `metrics.input_tokens` is already
 * the non-cached share — cache reads sit in their own field.
 */
export function devinRowsToEntries(
	rows: DevinMessageRow[],
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): void {
	const seen = new Set<string>();
	for (const row of rows) {
		if (!row.chat_message) continue;
		let message: DevinChatMessage;
		try {
			message = JSON.parse(row.chat_message);
		} catch {
			continue;
		}
		if (message.role !== "assistant") continue;
		const metrics = message.metadata?.metrics;
		if (!metrics) continue;
		const dedupeKey = message.metadata?.request_id ?? message.message_id;
		if (dedupeKey) {
			if (seen.has(dedupeKey)) continue;
			seen.add(dedupeKey);
		}
		const isoMs = Date.parse(message.metadata?.created_at ?? "");
		const timestampMs = Number.isFinite(isoMs)
			? isoMs
			: num(row.created_at) * 1000;
		if (!timestampMs || timestampMs < cutoffMs) continue;
		const uncachedInput = num(metrics.input_tokens);
		const cachedInput = num(metrics.cache_read_tokens);
		const cacheWrite = num(metrics.cache_creation_tokens);
		const output = num(metrics.output_tokens);
		if (uncachedInput + cachedInput + cacheWrite + output === 0) continue;
		const sessionId = row.session_id ?? "unknown";
		if (row.title && sessionLabels && !sessionLabels.has(sessionId)) {
			sessionLabels.set(sessionId, row.title);
		}
		out.push({
			agent: "devin",
			model: message.metadata?.generation_model || row.model || "unknown",
			timestampMs,
			cwd: row.working_directory ?? null,
			sessionId,
			uncachedInput,
			cachedInput,
			cacheWrite5m: cacheWrite,
			cacheWrite1h: 0,
			output,
			reasoningOutput: 0,
		});
	}
}
