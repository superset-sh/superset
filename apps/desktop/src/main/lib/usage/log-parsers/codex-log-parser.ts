import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CostStats } from "../usage-snapshot";
import { aggregateUsage, type UsageEntry } from "./cost-aggregator";
import { collectLogFiles, type LogFile } from "./log-files";

const CODEX_SESSIONS_DIR = join(homedir(), ".codex", "sessions");
const MAX_AGE_DAYS = 31;

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function num(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

interface ExtractedUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
}

/** Pulls per-turn token counts from the many shapes Codex has shipped. */
function extractUsage(obj: Record<string, unknown>): ExtractedUsage | null {
	const input =
		num(obj.input_tokens) || num(obj.prompt_tokens) || num(obj.inputTokens);
	const output =
		num(obj.output_tokens) ||
		num(obj.completion_tokens) ||
		num(obj.outputTokens);
	const cacheRead =
		num(obj.cached_input_tokens) ||
		num(obj.cache_read_input_tokens) ||
		num(obj.cached_tokens);
	if (input === 0 && output === 0 && cacheRead === 0) return null;
	return {
		inputTokens: input,
		outputTokens: output,
		cacheReadTokens: cacheRead,
	};
}

function findModel(record: Record<string, unknown>): string | null {
	if (typeof record.model === "string") return record.model;
	const payload = record.payload;
	if (isRecord(payload) && typeof payload.model === "string") {
		return payload.model;
	}
	return null;
}

function findUsage(record: Record<string, unknown>): ExtractedUsage | null {
	const direct = extractUsage(record);
	if (direct) return direct;
	if (isRecord(record.usage)) {
		const fromUsage = extractUsage(record.usage);
		if (fromUsage) return fromUsage;
	}
	// Rollout events wrap data in a `payload`; the usage may sit there or under
	// a nested `usage`/`info` object.
	const payload = record.payload;
	if (isRecord(payload)) {
		const fromPayload = extractUsage(payload);
		if (fromPayload) return fromPayload;
		if (isRecord(payload.usage)) {
			const nested = extractUsage(payload.usage);
			if (nested) return nested;
		}
		if (isRecord(payload.info) && isRecord(payload.info.last_token_usage)) {
			const info = extractUsage(payload.info.last_token_usage);
			if (info) return info;
		}
	}
	return null;
}

function parseRecords(records: unknown[], file: LogFile): UsageEntry[] {
	const entries: UsageEntry[] = [];
	// Codex records the model once in session/turn metadata, then emits
	// model-less token-count events; carry the last-seen model forward.
	let currentModel = "unknown";

	for (const record of records) {
		if (!isRecord(record)) continue;
		const model = findModel(record);
		if (model) currentModel = model;

		const usage = findUsage(record);
		if (!usage) continue;

		const rawTimestamp = record.timestamp ?? record.time ?? record.ts;
		const parsed =
			typeof rawTimestamp === "string" || typeof rawTimestamp === "number"
				? new Date(rawTimestamp)
				: null;
		const timestamp =
			parsed && !Number.isNaN(parsed.getTime())
				? parsed
				: new Date(file.mtimeMs);

		entries.push({
			timestamp,
			model: currentModel,
			sessionId: file.sessionId,
			inputTokens: usage.inputTokens,
			outputTokens: usage.outputTokens,
			cacheReadTokens: usage.cacheReadTokens,
		});
	}
	return entries;
}

function parseFile(content: string, file: LogFile): UsageEntry[] {
	const lineRecords: unknown[] = [];
	let matchedAnyLine = false;
	for (const raw of content.split("\n")) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		try {
			lineRecords.push(JSON.parse(trimmed));
			matchedAnyLine = true;
		} catch {
			// Not JSONL; fall through to whole-document parsing below.
		}
	}
	if (matchedAnyLine) return parseRecords(lineRecords, file);

	try {
		const doc: unknown = JSON.parse(content);
		return parseRecords(Array.isArray(doc) ? doc : [doc], file);
	} catch {
		return [];
	}
}

/** Returns null on missing logs or an unrecognized format. */
export async function parseCodexLogs(): Promise<CostStats | null> {
	const [jsonl, json] = await Promise.all([
		collectLogFiles(CODEX_SESSIONS_DIR, ".jsonl", MAX_AGE_DAYS),
		collectLogFiles(CODEX_SESSIONS_DIR, ".json", MAX_AGE_DAYS),
	]);
	const files = [...jsonl, ...json];
	if (files.length === 0) return null;

	const entries: UsageEntry[] = [];
	for (const file of files) {
		let content: string;
		try {
			content = await readFile(file.path, "utf8");
		} catch {
			continue;
		}
		entries.push(...parseFile(content, file));
	}

	if (entries.length === 0) return null;
	return aggregateUsage("codex", entries);
}
