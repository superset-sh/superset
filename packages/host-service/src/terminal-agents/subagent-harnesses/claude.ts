import fs from "node:fs";
import path from "node:path";
import {
	clip,
	isRecord,
	parseTimestamp,
	type SubagentTranscriptEntry,
	summarizeToolInput,
} from "../subagent-transcript";
import { defineSubagentHarness } from "./types";

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

/**
 * The `agent-<id>.meta.json` sidecar Claude writes beside a child's
 * transcript at spawn: the Task description, and for a nested child the
 * `parentAgentId` and `spawnDepth` of the agent that spawned it. Null when
 * the file is not there yet or unreadable.
 */
function readClaudeMeta(
	transcriptPath: string,
): Record<string, unknown> | null {
	const metaPath = transcriptPath.replace(/\.jsonl$/, ".meta.json");
	try {
		const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
		return isRecord(meta) ? meta : null;
	} catch {
		return null;
	}
}

/**
 * Claude Code. Hooks inside a child run against the parent session file
 * (`<dir>/<sessionId>.jsonl`, same session id as the parent, at every
 * depth) while the child writes `<dir>/<sessionId>/subagents/agent-<id>.jsonl`
 * with an `agent-<id>.meta.json` sidecar. SubagentStop names the child
 * directly as `agent_transcript_path`. Only the sidecar knows who spawned a
 * nested child.
 */
export const claudeSubagentHarness = defineSubagentHarness({
	belongsToParentSession: (hint, parentSessionId) =>
		!hint.sessionId || hint.sessionId === parentSessionId,
	resolveTranscriptPath(hint) {
		if (hint.agentTranscriptPath) return hint.agentTranscriptPath;
		const { transcriptPath, sessionId, subagentId } = hint;
		if (!transcriptPath) return undefined;
		if (sessionId && path.basename(transcriptPath) === `${sessionId}.jsonl`) {
			return path.join(
				path.dirname(transcriptPath),
				sessionId,
				"subagents",
				`agent-${subagentId}.jsonl`,
			);
		}
		return transcriptPath;
	},
	parseTranscript: (text) => ({ entries: parseClaudeSubagentTranscript(text) }),
	readDescription(transcriptPath) {
		const description = readClaudeMeta(transcriptPath)?.description;
		return typeof description === "string" ? description : undefined;
	},
	resolveParent(hint, context) {
		const transcriptPath =
			context.transcriptPath ??
			claudeSubagentHarness.resolveTranscriptPath(hint);
		if (!transcriptPath) return { known: false };
		const meta = readClaudeMeta(transcriptPath);
		if (meta === null) return undefined;
		const parent = meta.parentAgentId;
		return typeof parent === "string" && parent && parent !== hint.subagentId
			? { parentSubagentId: parent, known: true }
			: { known: true };
	},
});
