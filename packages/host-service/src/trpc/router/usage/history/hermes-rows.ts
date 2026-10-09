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

interface HermesUsage {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	reasoning: number;
	costUsd: number;
}
const USAGE_KEYS: (keyof HermesUsage)[] = [
	"input",
	"output",
	"cacheRead",
	"cacheWrite",
	"reasoning",
	"costUsd",
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
	const attributed = new Map<string, HermesUsage>();

	const push = (
		session: HermesSessionRow,
		model: string | null,
		atSeconds: number | null,
		usage: HermesUsage,
	) => {
		const timestampMs = num(atSeconds ?? session.activity_at) * 1000;
		if (!timestampMs || timestampMs < cutoffMs) return;
		const tokens =
			usage.input + usage.cacheRead + usage.cacheWrite + usage.output;
		if (tokens === 0 && usage.costUsd === 0) return;
		if (session.title && sessionLabels && !sessionLabels.has(session.id)) {
			sessionLabels.set(session.id, session.title);
		}
		out.push({
			agent: "hermes",
			model: model || session.model || "unknown",
			timestampMs,
			cwd: session.cwd,
			sessionId: session.id,
			uncachedInput: usage.input,
			cachedInput: usage.cacheRead,
			cacheWrite5m: usage.cacheWrite,
			cacheWrite1h: 0,
			output: usage.output,
			reasoningOutput: Math.min(usage.output, usage.reasoning),
			...(usage.costUsd > 0 ? { costUsd: usage.costUsd } : {}),
		});
	};

	for (const row of modelRows) {
		const session = sessionsById.get(row.session_id);
		if (!session) continue;
		const usage = readUsage(row);
		const sum = attributed.get(session.id);
		if (sum) {
			for (const key of USAGE_KEYS) sum[key] += usage[key];
		} else {
			attributed.set(session.id, { ...usage });
		}
		push(session, row.model, row.last_seen, usage);
	}

	for (const session of sessions) {
		const residual = readUsage(session);
		const covered = attributed.get(session.id);
		for (const key of USAGE_KEYS) {
			residual[key] = Math.max(0, residual[key] - (covered?.[key] ?? 0));
		}
		push(session, session.model, session.activity_at, residual);
	}
}

/** Hermes fills `actual_cost_usd` only when the provider reports a bill;
 * one cost per row keeps rows and session totals comparable. */
function readUsage(row: HermesTokenColumns): HermesUsage {
	return {
		input: num(row.input_tokens),
		output: num(row.output_tokens),
		cacheRead: num(row.cache_read_tokens),
		cacheWrite: num(row.cache_write_tokens),
		reasoning: num(row.reasoning_tokens),
		costUsd: num(row.actual_cost_usd) || num(row.estimated_cost_usd),
	};
}
