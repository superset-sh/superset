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

function clip(text: string): string {
	return text.length > MAX_ENTRY_CHARS
		? `${text.slice(0, MAX_ENTRY_CHARS)}…`
		: text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
	if (typeof value === "string") return value;
	if (value === undefined || value === null) return "";
	try {
		return JSON.stringify(value);
	} catch {
		return String(value);
	}
}

function parseTimestamp(value: unknown): number | undefined {
	if (typeof value !== "string") return undefined;
	const ms = Date.parse(value);
	return Number.isNaN(ms) ? undefined : ms;
}

/** Short, human summary of a tool call's input. */
function summarizeToolInput(input: unknown): string {
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

/** Text of a Claude / Anthropic content block list. */
function blocksText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((block) =>
			isRecord(block) && typeof block.text === "string" ? block.text : "",
		)
		.filter(Boolean)
		.join("\n");
}

export function parseClaudeSubagentTranscript(
	text: string,
): SubagentTranscriptEntry[] {
	const entries: SubagentTranscriptEntry[] = [];
	let lineNumber = 0;
	for (const line of text.split("\n")) {
		lineNumber += 1;
		if (!line.trim()) continue;
		let record: unknown;
		try {
			record = JSON.parse(line);
		} catch {
			continue;
		}
		if (!isRecord(record)) continue;
		const message = isRecord(record.message) ? record.message : undefined;
		if (!message) continue;
		const type = record.type;
		if (type !== "user" && type !== "assistant") continue;
		const baseId =
			typeof record.uuid === "string" ? record.uuid : `line-${lineNumber}`;
		const timestamp = parseTimestamp(record.timestamp);
		const content = message.content;

		if (typeof content === "string") {
			if (content.trim()) {
				entries.push({
					id: baseId,
					kind: type === "assistant" ? "assistant" : "user",
					text: clip(content),
					timestamp,
				});
			}
			continue;
		}
		if (!Array.isArray(content)) continue;
		content.forEach((block, index) => {
			if (!isRecord(block)) return;
			const id = `${baseId}:${index}`;
			switch (block.type) {
				case "text": {
					const body = typeof block.text === "string" ? block.text.trim() : "";
					if (!body) return;
					entries.push({
						id,
						kind: type === "assistant" ? "assistant" : "user",
						text: clip(body),
						timestamp,
					});
					return;
				}
				case "thinking": {
					const body =
						typeof block.thinking === "string" ? block.thinking.trim() : "";
					if (!body) return;
					entries.push({ id, kind: "thinking", text: clip(body), timestamp });
					return;
				}
				case "tool_use":
					entries.push({
						id,
						kind: "tool_call",
						toolName: typeof block.name === "string" ? block.name : "tool",
						text: summarizeToolInput(block.input),
						timestamp,
					});
					return;
				case "tool_result": {
					const body = blocksText(block.content).trim();
					entries.push({
						id,
						kind: "tool_result",
						text: clip(body),
						timestamp,
					});
					return;
				}
				default:
					return;
			}
		});
	}
	return entries;
}

/** Text of a Codex message content list (`input_text` / `output_text`). */
function codexContentText(content: unknown): string {
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	return content
		.map((part) =>
			isRecord(part) && typeof part.text === "string" ? part.text : "",
		)
		.filter(Boolean)
		.join("\n");
}

export function parseCodexRolloutTranscript(text: string): {
	entries: SubagentTranscriptEntry[];
	description?: string;
} {
	const entries: SubagentTranscriptEntry[] = [];
	let description: string | undefined;
	let line = 0;
	for (const raw of text.split("\n")) {
		line += 1;
		if (!raw.trim()) continue;
		let record: unknown;
		try {
			record = JSON.parse(raw);
		} catch {
			continue;
		}
		if (!isRecord(record)) continue;
		const payload = isRecord(record.payload) ? record.payload : undefined;
		if (!payload) continue;
		const timestamp = parseTimestamp(record.timestamp);
		const id = typeof payload.id === "string" ? payload.id : `line-${line}`;

		if (record.type === "session_meta") {
			const nickname =
				typeof payload.agent_nickname === "string"
					? payload.agent_nickname
					: "";
			const agentPath =
				typeof payload.agent_path === "string" ? payload.agent_path : "";
			description =
				[nickname, agentPath].filter(Boolean).join(" · ") || undefined;
			continue;
		}
		if (record.type !== "response_item") continue;

		switch (payload.type) {
			case "message": {
				const body = codexContentText(payload.content).trim();
				if (!body) break;
				if (payload.role === "assistant") {
					entries.push({ id, kind: "assistant", text: clip(body), timestamp });
				} else if (payload.role === "user") {
					entries.push({ id, kind: "user", text: clip(body), timestamp });
				}
				break;
			}
			case "agent_message": {
				const body = codexContentText(payload.content).trim();
				if (!body) break;
				const author = typeof payload.author === "string" ? payload.author : "";
				entries.push({
					id,
					kind: "user",
					text: clip(author ? `${author}: ${body}` : body),
					timestamp,
				});
				break;
			}
			case "reasoning": {
				const summary = Array.isArray(payload.summary)
					? payload.summary
							.map((part) =>
								isRecord(part) && typeof part.text === "string"
									? part.text
									: "",
							)
							.filter(Boolean)
							.join("\n")
					: "";
				if (!summary.trim()) break;
				entries.push({ id, kind: "thinking", text: clip(summary), timestamp });
				break;
			}
			case "function_call":
			case "custom_tool_call":
				entries.push({
					id,
					kind: "tool_call",
					toolName: typeof payload.name === "string" ? payload.name : "tool",
					text: summarizeToolInput(payload.arguments ?? payload.input),
					timestamp,
				});
				break;
			case "function_call_output":
			case "custom_tool_call_output": {
				let body = asString(payload.output);
				try {
					const parsed = JSON.parse(body);
					if (isRecord(parsed) && typeof parsed.output === "string") {
						body = parsed.output;
					}
				} catch {
					// plain text output
				}
				entries.push({
					id,
					kind: "tool_result",
					text: clip(body.trim()),
					timestamp,
				});
				break;
			}
			default:
				break;
		}
	}
	return { entries, description };
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
