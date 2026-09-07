import fs from "node:fs";

/**
 * One row of a subagent transcript as the subagent pane renders it. Both
 * harness formats fold into this: Claude's `subagents/agent-<id>.jsonl`
 * message records and Codex's child rollout `response_item`s.
 */
export interface SubagentTranscriptEntry {
	id: string;
	kind: "user" | "assistant" | "thinking" | "tool_call" | "tool_result";
	text: string;
	toolName?: string;
	timestamp?: number;
}

export interface SubagentTranscript {
	entries: SubagentTranscriptEntry[];
	/** Harness-provided title (Claude task description, Codex agent path). */
	description?: string;
	/** Bytes of the file that were parsed; the renderer polls on change. */
	size: number;
	mtimeMs: number;
}

/** Tail this much of a large transcript; the pane wants the recent story. */
const MAX_READ_BYTES = 2 * 1024 * 1024;
const MAX_ENTRY_CHARS = 4000;

export function clip(text: string): string {
	return text.length > MAX_ENTRY_CHARS
		? `${text.slice(0, MAX_ENTRY_CHARS)}…`
		: text;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === undefined || value === null) return "";
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

export function parseTimestamp(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? undefined : ms;
}

/** Short, human summary of a tool call's input, shared by every harness parser. */
export function summarizeToolInput(input: unknown): string {
	if (typeof input === "string") {
		try {
			return summarizeToolInput(JSON.parse(input));
		} catch {
			return clip(input);
		}
	}
	if (!isRecord(input)) return clip(asString(input));
	for (const key of [
		"command",
		"cmd",
		"file_path",
		"path",
		"pattern",
		"query",
		"url",
		"prompt",
		"description",
	]) {
		const value = input[key];
		if (typeof value === "string" && value.trim()) return clip(value);
		// Codex's shell tool passes argv as an array.
		if (
			Array.isArray(value) &&
			value.length > 0 &&
			value.every((part) => typeof part === "string")
		) {
			return clip(value.join(" "));
		}
	}
	return clip(asString(input));
}

/**
 * The tail of a transcript file, at most {@link MAX_READ_BYTES}, with the
 * partial first line of a tailed read dropped. Null when the file does not
 * exist yet.
 */
export function readTranscriptTail(
	transcriptPath: string,
): { text: string; size: number; mtimeMs: number } | null {
	let stat: fs.Stats;
	let fd: number;
	try {
		stat = fs.statSync(transcriptPath);
		fd = fs.openSync(transcriptPath, "r");
	} catch {
		return null;
	}
	const start = Math.max(0, stat.size - MAX_READ_BYTES);
	let text: string;
	try {
		// The child appends between stat and read; trust the bytes actually
		// read rather than the sampled size.
		const buffer = Buffer.alloc(stat.size - start);
		const bytesRead = fs.readSync(fd, buffer, 0, buffer.length, start);
		text = buffer.toString("utf8", 0, bytesRead);
	} catch {
		return null;
	} finally {
		fs.closeSync(fd);
	}
	if (start > 0) text = text.slice(text.indexOf("\n") + 1);
	return { text, size: stat.size, mtimeMs: stat.mtimeMs };
}
