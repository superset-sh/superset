import type { UsageLogEntry } from "./parse";
import { num } from "./parse";

interface HermesTokenColumns {
	input_tokens: number | null;
	output_tokens: number | null;
	cache_read_tokens: number | null;
	cache_write_tokens: number | null;
	reasoning_tokens: number | null;
	estimated_cost_usd: number | null;
	actual_cost_usd: number | null;
}

/** One `sessions` row of Hermes's `state.db`. Times are Unix seconds. */
export interface HermesSessionRow extends HermesTokenColumns {
	id: string;
	model: string | null;
	cwd: string | null;
	title: string | null;
	activity_at: number | null;
}

/** One `session_model_usage` row: per-call deltas summed per session,
 * model and task (`''` is the main loop, else an auxiliary call such as
 * title generation or compression). */
export interface HermesModelUsageRow extends HermesTokenColumns {
	session_id: string;
	model: string | null;
	last_seen: number | null;
}

type TokenKey = keyof HermesTokenColumns;
const TOKEN_KEYS: TokenKey[] = [
	"input_tokens",
	"output_tokens",
	"cache_read_tokens",
	"cache_write_tokens",
	"reasoning_tokens",
	"estimated_cost_usd",
	"actual_cost_usd",
];

/**
 * Same accounting as `hermes insights`: every per-model row, plus the part
 * of each session total that no per-model row covers (sessions older than
 * the table, and gateway runs that write absolute totals only).
 * `input_tokens` is already the uncached share.
 */
export function hermesRowsToEntries(
	sessions: HermesSessionRow[],
	modelRows: HermesModelUsageRow[],
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): void {
	const sessionsById = new Map(sessions.map((s) => [s.id, s]));
	const attributed = new Map<string, Record<TokenKey, number>>();

	const push = (
		session: HermesSessionRow,
		model: string | null,
		atSeconds: number | null,
		tokens: Record<TokenKey, number>,
	) => {
		const timestampMs = num(atSeconds ?? session.activity_at) * 1000;
		if (!timestampMs || timestampMs < cutoffMs) return;
		const output = tokens.output_tokens;
		const entryTokens = {
			uncachedInput: tokens.input_tokens,
			cachedInput: tokens.cache_read_tokens,
			cacheWrite5m: tokens.cache_write_tokens,
			cacheWrite1h: 0,
			output,
			reasoningOutput: Math.min(output, tokens.reasoning_tokens),
		};
		if (
			entryTokens.uncachedInput +
				entryTokens.cachedInput +
				entryTokens.cacheWrite5m +
				output ===
			0
		) {
			return;
		}
		if (session.title && sessionLabels && !sessionLabels.has(session.id)) {
			sessionLabels.set(session.id, session.title);
		}
		const costUsd = tokens.actual_cost_usd || tokens.estimated_cost_usd;
		out.push({
			agent: "hermes",
			model: model || session.model || "unknown",
			timestampMs,
			cwd: session.cwd,
			sessionId: session.id,
			...entryTokens,
			...(costUsd > 0 ? { costUsd } : {}),
		});
	};

	for (const row of modelRows) {
		const session = sessionsById.get(row.session_id);
		if (!session) continue;
		const tokens = readTokens(row);
		const sum = attributed.get(session.id);
		if (sum) {
			for (const key of TOKEN_KEYS) sum[key] += tokens[key];
		} else {
			attributed.set(session.id, { ...tokens });
		}
		push(session, row.model, row.last_seen, tokens);
	}

	for (const session of sessions) {
		const total = readTokens(session);
		const covered = attributed.get(session.id);
		const residual = Object.fromEntries(
			TOKEN_KEYS.map((key) => [
				key,
				Math.max(0, total[key] - (covered?.[key] ?? 0)),
			]),
		) as Record<TokenKey, number>;
		push(session, session.model, session.activity_at, residual);
	}
}

function readTokens(row: HermesTokenColumns): Record<TokenKey, number> {
	return Object.fromEntries(
		TOKEN_KEYS.map((key) => [key, num(row[key])]),
	) as Record<TokenKey, number>;
}
