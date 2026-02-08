/**
 * Reads Claude Code session messages from JSONL files on disk.
 *
 * Converts Claude's native message format (text, thinking, tool_use, tool_result)
 * into TanStack AI UIMessage-compatible parts for rendering.
 *
 * Tool results from user turns are merged into the preceding assistant message
 * so that tool-call and tool-result parts are co-located for rendering.
 */

import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { findSessionFilePath } from "./claude-session-scanner";

// ============================================================================
// Types — discriminated union matching TanStack AI MessagePart shape
// ============================================================================

type TextPart = { type: "text"; content: string };
type ThinkingPart = { type: "thinking"; content: string };
type ToolCallPart = {
	type: "tool-call";
	id: string;
	name: string;
	arguments: Record<string, unknown>;
	state: "complete";
};
type ToolResultPart = {
	type: "tool-result";
	toolCallId: string;
	content: string;
	state: "complete";
};

export type ClaudeSessionMessagePart =
	| TextPart
	| ThinkingPart
	| ToolCallPart
	| ToolResultPart;

export interface ClaudeSessionMessage {
	id: string;
	role: "user" | "assistant";
	parts: ClaudeSessionMessagePart[];
}

// ============================================================================
// Content block conversion
// ============================================================================

/** Map from Claude API content block format to UIMessage part format. */
function convertContentBlock(
	block: Record<string, unknown>,
): ClaudeSessionMessagePart | null {
	switch (block.type) {
		case "text":
			return { type: "text", content: block.text as string };
		case "thinking":
			return { type: "thinking", content: block.thinking as string };
		case "tool_use":
			return {
				type: "tool-call",
				id: block.id as string,
				name: block.name as string,
				arguments: (block.input as Record<string, unknown>) ?? {},
				state: "complete",
			};
		case "tool_result": {
			const raw = block.content;
			const content = typeof raw === "string" ? raw : JSON.stringify(raw ?? "");
			return {
				type: "tool-result",
				toolCallId: block.tool_use_id as string,
				content,
				state: "complete",
			};
		}
		default:
			return null;
	}
}

// ============================================================================
// JSONL line parsing
// ============================================================================

function parseUserLine(
	parsed: Record<string, unknown>,
	msgId: string,
	messages: ClaudeSessionMessage[],
): void {
	const msg = parsed.message as { content: unknown } | undefined;
	if (!msg) return;

	const content = msg.content;

	if (typeof content === "string") {
		messages.push({
			id: msgId,
			role: "user",
			parts: [{ type: "text", content }],
		});
		return;
	}

	if (!Array.isArray(content)) return;

	const toolResultParts: ToolResultPart[] = [];
	const otherParts: ClaudeSessionMessagePart[] = [];

	for (const block of content) {
		const part = convertContentBlock(block as Record<string, unknown>);
		if (!part) continue;
		if (part.type === "tool-result") {
			toolResultParts.push(part);
		} else {
			otherParts.push(part);
		}
	}

	// Merge tool results into the last assistant message
	if (toolResultParts.length > 0) {
		const lastMsg = messages[messages.length - 1];
		if (lastMsg?.role === "assistant") {
			lastMsg.parts.push(...toolResultParts);
		}
	}

	if (otherParts.length > 0) {
		messages.push({ id: msgId, role: "user", parts: otherParts });
	}
}

function parseAssistantLine(
	parsed: Record<string, unknown>,
	msgId: string,
	messages: ClaudeSessionMessage[],
): void {
	const msg = parsed.message as { content: unknown } | undefined;
	if (!msg) return;

	const content = msg.content;
	const parts: ClaudeSessionMessagePart[] = [];

	if (Array.isArray(content)) {
		for (const block of content) {
			const part = convertContentBlock(block as Record<string, unknown>);
			if (part) parts.push(part);
		}
	} else if (typeof content === "string") {
		parts.push({ type: "text", content });
	}

	if (parts.length > 0) {
		messages.push({ id: msgId, role: "assistant", parts });
	}
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Reads all user/assistant messages from a Claude Code session JSONL file.
 *
 * Uses streaming line-by-line reads to handle large files efficiently.
 * Returns messages in UIMessage-compatible format for direct rendering.
 */
export async function readClaudeSessionMessages({
	sessionId,
}: {
	sessionId: string;
}): Promise<ClaudeSessionMessage[]> {
	const filePath = await findSessionFilePath({ sessionId });
	if (!filePath) return [];

	const messages: ClaudeSessionMessage[] = [];
	let messageCounter = 0;

	try {
		const rl = createInterface({
			input: createReadStream(filePath, { encoding: "utf-8" }),
			crlfDelay: Number.POSITIVE_INFINITY,
		});

		for await (const line of rl) {
			if (!line.trim()) continue;
			try {
				const parsed = JSON.parse(line) as Record<string, unknown>;
				const msgId = (parsed.uuid as string) ?? `cc-msg-${++messageCounter}`;

				if (parsed.type === "user") {
					parseUserLine(parsed, msgId, messages);
				} else if (parsed.type === "assistant") {
					parseAssistantLine(parsed, msgId, messages);
				}
			} catch {
				// Skip unparseable lines
			}
		}
	} catch {
		return [];
	}

	return messages;
}
