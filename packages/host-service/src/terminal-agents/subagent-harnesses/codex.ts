import {
	asString,
	clip,
	isRecord,
	parseTimestamp,
	readTranscriptHeadRecord,
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

/** The child's title from a rollout's `session_meta` payload. */
function sessionMetaDescription(
	payload: Record<string, unknown>,
): string | undefined {
	const nickname =
		typeof payload.agent_nickname === "string" ? payload.agent_nickname : "";
	const agentPath =
		typeof payload.agent_path === "string" ? payload.agent_path : "";
	return [nickname, agentPath].filter(Boolean).join(" · ") || undefined;
}

function sessionMetaPayload(
	record: Record<string, unknown>,
): Record<string, unknown> | undefined {
	return record.type === "session_meta" && isRecord(record.payload)
		? record.payload
		: undefined;
}

/**
 * The thread that spawned this one, from
 * `session_meta.payload.source.subagent.thread_spawn.parent_thread_id`
 * (codex_cli_rs 0.117).
 */
function sessionMetaParentThreadId(
	payload: Record<string, unknown>,
): string | undefined {
	const source = isRecord(payload.source) ? payload.source : undefined;
	const subagent = isRecord(source?.subagent) ? source.subagent : undefined;
	const spawn = isRecord(subagent?.thread_spawn)
		? subagent.thread_spawn
		: undefined;
	return typeof spawn?.parent_thread_id === "string"
		? spawn.parent_thread_id
		: undefined;
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
			description = sessionMetaDescription(payload);
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
	readDescription(transcriptPath) {
		const record = readTranscriptHeadRecord(transcriptPath);
		const payload = record ? sessionMetaPayload(record) : undefined;
		return payload && sessionMetaDescription(payload);
	},
	resolveParent(_hint, context) {
		if (!context.transcriptPath) return { known: false };
		const record = readTranscriptHeadRecord(context.transcriptPath);
		if (record === null) return undefined;
		const payload = record && sessionMetaPayload(record);
		const parentThreadId = payload && sessionMetaParentThreadId(payload);
		if (!parentThreadId) return { known: false };
		if (parentThreadId === context.parentSessionId) return { known: true };
		const spawner = context.siblings.find(
			(sibling) => sibling.sessionId === parentThreadId,
		);
		return spawner
			? { parentSubagentId: spawner.id, known: true }
			: { known: false };
	},
});
