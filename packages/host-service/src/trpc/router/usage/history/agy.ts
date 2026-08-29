/** Antigravity CLI transcript usage (`~/.gemini/antigravity-cli/brain`). */
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type { UsageLogEntry } from "./parse";
import { toSessionLabel } from "./parse";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject | null {
	return value && typeof value === "object" && !Array.isArray(value)
		? (value as JsonObject)
		: null;
}

function numberAt(value: JsonObject, keys: string[]): number {
	for (const key of keys) {
		const candidate = value[key];
		if (typeof candidate === "number" && Number.isFinite(candidate)) {
			return Math.max(0, candidate);
		}
	}
	return 0;
}

function findUsage(value: unknown, depth = 0): JsonObject | null {
	if (depth > 5) return null;
	const current = object(value);
	if (!current) return null;
	for (const key of ["usage", "usage_metadata", "usageMetadata"]) {
		const usage = object(current[key]);
		if (usage) return usage;
	}
	for (const child of Object.values(current)) {
		const found = findUsage(child, depth + 1);
		if (found) return found;
	}
	return null;
}

export function parseAgyTranscriptLine(
	line: string,
	sessionId: string,
	cwd: string | null,
): UsageLogEntry | null {
	let value: JsonObject;
	try {
		value = JSON.parse(line) as JsonObject;
	} catch {
		return null;
	}
	const usage = findUsage(value);
	if (!usage) return null;
	const input = numberAt(usage, [
		"input_tokens",
		"inputTokens",
		"prompt_token_count",
		"promptTokenCount",
	]);
	const cached = numberAt(usage, [
		"cached_input_tokens",
		"cachedInputTokens",
		"cached_content_token_count",
		"cachedContentTokenCount",
	]);
	const output = numberAt(usage, [
		"output_tokens",
		"outputTokens",
		"candidates_token_count",
		"candidatesTokenCount",
	]);
	const reasoning = numberAt(usage, [
		"reasoning_tokens",
		"reasoningTokens",
		"thoughts_token_count",
		"thoughtsTokenCount",
	]);
	if (input + cached + output === 0) return null;
	const rawTimestamp =
		value.created_at ?? value.timestamp ?? value.createdAt ?? usage.timestamp;
	const timestampMs =
		typeof rawTimestamp === "number"
			? rawTimestamp < 1e12
				? rawTimestamp * 1000
				: rawTimestamp
			: typeof rawTimestamp === "string"
				? Date.parse(rawTimestamp)
				: Number.NaN;
	if (!Number.isFinite(timestampMs)) return null;
	const modelValue = value.model ?? usage.model ?? value.model_id;
	const model =
		typeof modelValue === "string"
			? modelValue
			: ((object(modelValue)?.id as string | undefined) ?? "antigravity");
	return {
		agent: "agy",
		model,
		timestampMs,
		cwd,
		sessionId,
		uncachedInput: Math.max(0, input - cached),
		cachedInput: Math.min(input, cached),
		cacheWrite5m: 0,
		cacheWrite1h: 0,
		output,
		reasoningOutput: Math.min(output, reasoning),
	};
}

export async function collectAgyEntries(
	cutoffMs: number,
	out: UsageLogEntry[],
	sessionLabels: Map<string, string>,
): Promise<number> {
	const brain = join(homedir(), ".gemini", "antigravity-cli", "brain");
	let sessions: string[];
	try {
		sessions = await readdir(brain);
	} catch {
		return 0;
	}
	let scanned = 0;
	for (const sessionId of sessions) {
		const path = join(
			brain,
			sessionId,
			".system_generated",
			"logs",
			"transcript_full.jsonl",
		);
		try {
			if ((await stat(path)).mtimeMs < cutoffMs) continue;
		} catch {
			continue;
		}
		let stream: ReturnType<typeof createReadStream>;
		try {
			stream = createReadStream(path, { encoding: "utf8" });
		} catch {
			continue;
		}
		scanned += 1;
		const lines = createInterface({ input: stream, crlfDelay: Infinity });
		let cwd: string | null = null;
		try {
			for await (const line of lines) {
				let envelope: JsonObject | null = null;
				try {
					envelope = object(JSON.parse(line));
				} catch {
					continue;
				}
				if (!cwd) {
					const workspace = object(envelope?.workspace);
					const candidate =
						envelope?.cwd ?? workspace?.current_dir ?? workspace?.project_dir;
					if (typeof candidate === "string") cwd = candidate;
				}
				if (!sessionLabels.has(sessionId) && envelope?.type === "USER_INPUT") {
					const label = toSessionLabel(envelope.content);
					if (label) sessionLabels.set(sessionId, label);
				}
				const entry = parseAgyTranscriptLine(line, sessionId, cwd);
				if (entry && entry.timestampMs >= cutoffMs) out.push(entry);
			}
		} catch {
			// A concurrently written or removed transcript contributes what was read.
		}
	}
	return scanned;
}
