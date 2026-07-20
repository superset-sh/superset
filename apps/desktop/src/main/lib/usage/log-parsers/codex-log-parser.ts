import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CostStats } from "../usage-snapshot";
import { aggregateUsage, type UsageEntry } from "./cost-aggregator";
import { collectLogFiles, type LogFile } from "./log-files";

const CODEX_SESSIONS_DIR = join(homedir(), ".codex", "sessions");
const MAX_AGE_DAYS = 31;

interface CodexUsage {
	prompt_tokens?: number;
	completion_tokens?: number;
	input_tokens?: number;
	output_tokens?: number;
}

interface CodexLogEntry {
	model?: string;
	timestamp?: string;
	usage?: CodexUsage;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function entryFromRecord(
	record: Record<string, unknown>,
	file: LogFile,
): UsageEntry | null {
	const entry = record as CodexLogEntry;
	const usage = entry.usage;
	const model = entry.model;
	if (!usage || typeof model !== "string") return null;

	const inputTokens = usage.prompt_tokens ?? usage.input_tokens ?? 0;
	const outputTokens = usage.completion_tokens ?? usage.output_tokens ?? 0;
	if (inputTokens === 0 && outputTokens === 0) return null;

	const parsed = entry.timestamp ? new Date(entry.timestamp) : null;
	const timestamp =
		parsed && !Number.isNaN(parsed.getTime())
			? parsed
			: new Date(file.mtimeMs);

	return {
		timestamp,
		model,
		sessionId: file.sessionId,
		inputTokens,
		outputTokens,
	};
}

function parseFile(content: string, file: LogFile): UsageEntry[] {
	const entries: UsageEntry[] = [];

	// Codex writes newline-delimited JSON; fall back to a single JSON document
	// (object or array) for older/edge formats.
	const lines = content.split("\n");
	let matchedAnyLine = false;
	for (const raw of lines) {
		const trimmed = raw.trim();
		if (!trimmed) continue;
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed);
		} catch {
			continue;
		}
		if (!isRecord(parsed)) continue;
		matchedAnyLine = true;
		const entry = entryFromRecord(parsed, file);
		if (entry) entries.push(entry);
	}
	if (matchedAnyLine) return entries;

	let doc: unknown;
	try {
		doc = JSON.parse(content);
	} catch {
		return entries;
	}
	const records = Array.isArray(doc) ? doc : [doc];
	for (const record of records) {
		if (!isRecord(record)) continue;
		const entry = entryFromRecord(record, file);
		if (entry) entries.push(entry);
	}
	return entries;
}

/** Returns null on missing logs or an unrecognized format. */
export async function parseCodexLogs(): Promise<CostStats | null> {
	const files = await collectLogFiles(CODEX_SESSIONS_DIR, ".json", MAX_AGE_DAYS);
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
