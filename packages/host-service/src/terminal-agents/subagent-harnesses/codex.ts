import {
	asString,
	clip,
	isRecord,
	parseTimestamp,
	type SubagentTranscriptEntry,
	summarizeToolInput,
} from "../subagent-transcript";
import { defineSubagentHarness } from "./types";

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
 * Codex. A spawned child is its own thread with its own rollout file and
 * its hooks run against that file, so the hook's path is the child's. The
 * rollout's `session_meta` carries the nickname and agent path.
 */
export const codexSubagentHarness = defineSubagentHarness({
	parseTranscript: parseCodexRolloutTranscript,
});
