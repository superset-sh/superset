/**
 * Streaming parsers for the agents' own transcript files — the same
 * source ccusage and T3 Code read, so usage is complete even for turns not
 * driven through Superset.
 *
 * Correctness rules learned from prior art (see
 * plans/20260815-token-spend-twitter-feedback.md):
 * - Claude: count only `type === "assistant"` lines with usage, dedupe on
 *   `message.id + requestId` — the same message is rewritten into multiple
 *   files on resume/fork/compaction, and naive parsers over-count.
 * - Codex: read `payload.info.last_token_usage` (per-turn delta), never
 *   `total_token_usage` (cumulative). Model/cwd ride on `turn_context`
 *   events and carry forward. `input_tokens` is INCLUSIVE of cached tokens.
 * - Reasoning tokens are a subset of output — never added on top.
 */

import { createReadStream } from "node:fs";
import { basename } from "node:path";
import { createInterface } from "node:readline";
import type { UsageAgent } from "../types";
import type { LogFile } from "./logs";

export interface UsageLogEntry {
	agent: UsageAgent;
	model: string;
	timestampMs: number;
	cwd: string | null;
	/** Transcript file identity — one file is one CLI session. */
	sessionId: string;
	uncachedInput: number;
	cachedInput: number;
	cacheWrite5m: number;
	cacheWrite1h: number;
	output: number;
	reasoningOutput: number;
	/** Agent-reported real cost in USD (opencode/pi/fx/cursor record one).
	 * When present it replaces the API-list-rate estimate. */
	costUsd?: number;
}

export function sessionIdForFile(path: string): string {
	return basename(path).replace(/\.jsonl$/, "");
}

const SESSION_LABEL_MAX = 80;

/** First real user prompt of a session, trimmed to one short line. Command
 * invocations, caveats, and system-reminder wrappers don't count. */
export function toSessionLabel(text: unknown): string | null {
	if (typeof text !== "string") return null;
	const trimmed = text.trim();
	if (
		!trimmed ||
		trimmed.startsWith("<") ||
		trimmed.startsWith("#") ||
		trimmed.startsWith("Caveat:")
	) {
		return null;
	}
	const line = trimmed.split("\n", 1)[0] ?? "";
	if (!line) return null;
	return line.length > SESSION_LABEL_MAX
		? `${line.slice(0, SESSION_LABEL_MAX - 1)}…`
		: line;
}

export async function forEachLine(
	path: string,
	onLine: (line: string) => void,
): Promise<void> {
	try {
		const rl = createInterface({
			input: createReadStream(path, { encoding: "utf-8" }),
			crlfDelay: Number.POSITIVE_INFINITY,
		});
		for await (const line of rl) onLine(line);
	} catch {
		// Unreadable or vanished mid-scan — skip the file.
	}
}

export function num(value: unknown): number {
	// Clamp negatives — a corrupt count must not subtract from totals.
	return typeof value === "number" && Number.isFinite(value) && value > 0
		? value
		: 0;
}

/** Entry timestamp: parseable and not in the future (26h clock-skew
 * tolerance) wins; otherwise the file's mtime; never NaN. */
export function entryTimestamp(
	raw: string | undefined,
	mtimeMs: number,
): number {
	const parsed = raw ? Date.parse(raw) : Number.NaN;
	if (Number.isFinite(parsed) && parsed <= Date.now() + 26 * 60 * 60 * 1000) {
		return parsed;
	}
	return mtimeMs;
}

interface ClaudeLine {
	type?: string;
	requestId?: string;
	isSidechain?: boolean;
	isMeta?: boolean;
	timestamp?: string;
	cwd?: string;
	message?: {
		id?: string;
		model?: string;
		content?: string | Array<{ type?: string; text?: string }>;
		usage?: {
			input_tokens?: number;
			output_tokens?: number;
			cache_read_input_tokens?: number;
			cache_creation_input_tokens?: number;
			cache_creation?: {
				ephemeral_5m_input_tokens?: number;
				ephemeral_1h_input_tokens?: number;
			};
			output_tokens_details?: { thinking_tokens?: number };
		};
	};
}

/**
 * Parses `~/.claude/projects/<encoded-cwd>/*.jsonl`. `entriesByMessage` is
 * shared across all files so resumed/forked sessions dedupe globally.
 *
 * Dedupe keeps the LAST occurrence per `message.id + requestId`: Claude Code
 * writes one assistant line per content block with a usage snapshot that
 * grows as the response streams, so only the final line carries the request's
 * complete usage (verified token-exact against ccusage; first-wins
 * undercounts output ~10%).
 */
export async function parseClaudeLogFile(
	file: LogFile,
	entriesByMessage: Map<string, UsageLogEntry>,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): Promise<void> {
	const sessionId = sessionIdForFile(file.path);
	await forEachLine(file.path, (line) => {
		const wantLabel = sessionLabels ? !sessionLabels.has(sessionId) : false;
		if (
			!line.includes('"assistant"') &&
			!(wantLabel && line.includes('"user"'))
		) {
			return;
		}
		let parsed: ClaudeLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}
		if (wantLabel && parsed.type === "user" && !parsed.isMeta) {
			const content = parsed.message?.content;
			const text =
				typeof content === "string"
					? content
					: content?.find((block) => block.type === "text")?.text;
			const label = toSessionLabel(text);
			if (label) sessionLabels?.set(sessionId, label);
		}
		if (parsed.type !== "assistant") return;
		const usage = parsed.message?.usage;
		const model = parsed.message?.model;
		if (!usage || !model || model === "<synthetic>") return;

		const timestampMs = entryTimestamp(parsed.timestamp, file.mtimeMs);
		if (timestampMs < cutoffMs) return;

		const cacheWriteTotal = num(usage.cache_creation_input_tokens);
		const write5m = num(usage.cache_creation?.ephemeral_5m_input_tokens);
		const write1h = num(usage.cache_creation?.ephemeral_1h_input_tokens);
		const entry: UsageLogEntry = {
			agent: "claude",
			model,
			timestampMs,
			cwd: typeof parsed.cwd === "string" ? parsed.cwd : null,
			sessionId,
			// Anthropic's input_tokens excludes cache reads and writes.
			uncachedInput: num(usage.input_tokens),
			cachedInput: num(usage.cache_read_input_tokens),
			// Older logs lack the 5m/1h split; treat the total as 5m writes.
			cacheWrite5m: write5m + write1h > 0 ? write5m : cacheWriteTotal,
			cacheWrite1h: write1h,
			output: num(usage.output_tokens),
			reasoningOutput: num(usage.output_tokens_details?.thinking_tokens),
		};

		const dedupeKey = `${parsed.message?.id ?? ""}|${parsed.requestId ?? ""}`;
		if (dedupeKey === "|") {
			out.push(entry);
		} else {
			entriesByMessage.set(dedupeKey, entry);
		}
	});
}

interface CodexLine {
	type?: string;
	timestamp?: string;
	payload?: {
		type?: string;
		model?: string;
		cwd?: string;
		message?: string;
		info?: {
			last_token_usage?: {
				input_tokens?: number;
				cached_input_tokens?: number;
				cache_write_input_tokens?: number;
				output_tokens?: number;
				reasoning_output_tokens?: number;
			};
		};
	};
}

/** Parses `$CODEX_HOME/sessions/**\/*.jsonl` rollout files. */
export async function parseCodexLogFile(
	file: LogFile,
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels?: Map<string, string>,
): Promise<void> {
	const sessionId = sessionIdForFile(file.path);
	let currentModel: string | null = null;
	let currentCwd: string | null = null;
	// Codex occasionally re-emits the same token_count event back-to-back;
	// skipping consecutive identical deltas brings summed deltas within ~1%
	// of the session's own cumulative total_token_usage counter.
	let previousDeltaSignature: string | null = null;

	await forEachLine(file.path, (line) => {
		const wantLabel = sessionLabels ? !sessionLabels.has(sessionId) : false;
		const isContext =
			line.includes('"turn_context"') || line.includes('"session_meta"');
		if (
			!isContext &&
			!line.includes('"token_count"') &&
			!(wantLabel && line.includes('"user_message"'))
		) {
			return;
		}
		let parsed: CodexLine;
		try {
			parsed = JSON.parse(line);
		} catch {
			return;
		}

		if (wantLabel && parsed.payload?.type === "user_message") {
			const label = toSessionLabel(parsed.payload.message);
			if (label) sessionLabels?.set(sessionId, label);
			return;
		}

		if (parsed.type === "turn_context" || parsed.type === "session_meta") {
			if (typeof parsed.payload?.model === "string") {
				currentModel = parsed.payload.model;
			}
			if (typeof parsed.payload?.cwd === "string") {
				currentCwd = parsed.payload.cwd;
			}
			return;
		}

		if (parsed.payload?.type !== "token_count") return;
		const usage = parsed.payload.info?.last_token_usage;
		if (!usage) return;

		const signature = JSON.stringify(usage);
		if (signature === previousDeltaSignature) return;
		previousDeltaSignature = signature;

		const timestampMs = entryTimestamp(parsed.timestamp, file.mtimeMs);
		if (timestampMs < cutoffMs) return;

		const input = num(usage.input_tokens);
		const cached = num(usage.cached_input_tokens);
		out.push({
			agent: "codex",
			model: currentModel ?? "unknown",
			timestampMs,
			cwd: currentCwd,
			sessionId,
			// OpenAI's input_tokens includes cached tokens; split them out.
			uncachedInput: Math.max(0, input - cached),
			cachedInput: cached,
			cacheWrite5m: num(usage.cache_write_input_tokens),
			cacheWrite1h: 0,
			output: num(usage.output_tokens),
			reasoningOutput: num(usage.reasoning_output_tokens),
		});
	});
}
