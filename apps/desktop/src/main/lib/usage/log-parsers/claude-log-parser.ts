import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { CostStats } from "../usage-snapshot";
import { aggregateUsage, type UsageEntry } from "./cost-aggregator";
import { collectLogFiles } from "./log-files";

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const MAX_AGE_DAYS = 31;

interface ClaudeUsage {
	input_tokens?: number;
	output_tokens?: number;
	cache_creation_input_tokens?: number;
	cache_read_input_tokens?: number;
}

interface ClaudeLogLine {
	type?: string;
	timestamp?: string;
	message?: {
		model?: string;
		usage?: ClaudeUsage;
	};
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function parseLine(raw: string, sessionId: string): UsageEntry | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return null;
	}
	if (!isRecord(parsed)) return null;
	const line = parsed as ClaudeLogLine;

	if (line.type !== "assistant") return null;
	const usage = line.message?.usage;
	const model = line.message?.model;
	if (!usage || typeof model !== "string") return null;

	const timestamp = line.timestamp ? new Date(line.timestamp) : null;
	if (!timestamp || Number.isNaN(timestamp.getTime())) return null;

	const inputTokens = usage.input_tokens ?? 0;
	const outputTokens = usage.output_tokens ?? 0;
	const cacheCreationTokens = usage.cache_creation_input_tokens ?? 0;
	const cacheReadTokens = usage.cache_read_input_tokens ?? 0;
	if (
		inputTokens === 0 &&
		outputTokens === 0 &&
		cacheCreationTokens === 0 &&
		cacheReadTokens === 0
	) {
		return null;
	}

	return {
		timestamp,
		model,
		sessionId,
		inputTokens,
		outputTokens,
		cacheCreationTokens,
		cacheReadTokens,
	};
}

/** Returns null on missing logs or an unrecognized format. */
export async function parseClaudeLogs(): Promise<CostStats | null> {
	const files = await collectLogFiles(
		CLAUDE_PROJECTS_DIR,
		".jsonl",
		MAX_AGE_DAYS,
	);
	if (files.length === 0) return null;

	const entries: UsageEntry[] = [];
	for (const file of files) {
		let content: string;
		try {
			content = await readFile(file.path, "utf8");
		} catch {
			continue;
		}
		for (const raw of content.split("\n")) {
			const trimmed = raw.trim();
			if (!trimmed) continue;
			const entry = parseLine(trimmed, file.sessionId);
			if (entry) entries.push(entry);
		}
	}

	if (entries.length === 0) return null;
	return aggregateUsage("claude", entries);
}
