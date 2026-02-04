/**
 * Message Materialization (SDK-Native, Zero Envelope)
 *
 * Processes raw SDK messages and user input chunks from the durable stream
 * in collection order. Turn boundaries are detected from SDK message type
 * transitions (stream_event after user = new turn).
 *
 * No envelope fields (messageId, seq, role, actorId) — SDK messages are
 * stored as-is, user input uses { type: "user_input", content, actorId }.
 */

import type {
	SDKAssistantMessage,
	SDKMessage,
	SDKPartialAssistantMessage,
	SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import type {
	BetaContentBlock,
	BetaRawContentBlockDeltaEvent,
	BetaRawContentBlockStartEvent,
	BetaTextBlock,
	BetaToolUseBlock,
} from "@anthropic-ai/sdk/resources/beta/messages/messages";

// ============================================================================
// Types
// ============================================================================

export type MessageRole = "user" | "assistant" | "system";

/** Pre-merged tool result — SDK has no joined tool_use + tool_result concept */
export interface ToolResult {
	output: string;
	isError: boolean;
}

/** Materialized UI state from durable stream chunks */
export interface MessageRow {
	id: string;
	role: MessageRole;
	content: string;
	contentBlocks: BetaContentBlock[];
	toolResults: Map<string, ToolResult>;
	actorId: string;
	isComplete: boolean;
	isStreaming: boolean;
	createdAt: Date;
}

/** Raw chunk row from the durable stream collection */
export type ChunkRow = Record<string, unknown> & { id: string };

interface ChunkSortKey {
	seq: number | null;
	time: number | null;
	index: number;
}

// ============================================================================
// Materialize All Messages
// ============================================================================

/**
 * Materialize all messages from raw chunk rows.
 *
 * Chunks are sorted by createdAt + _seq before processing to ensure
 * correct ordering regardless of collection insertion order (which
 * may not match stream append order after Electric SQL sync/reconnect).
 *
 * User input chunks become user messages. SDK message chunks are grouped
 * into assistant turns with automatic boundary detection.
 */
export function materializeMessages(chunks: ChunkRow[]): MessageRow[] {
	if (chunks.length === 0) return [];

	// Sort by stream sequence when available, then createdAt, then original index.
	// createdAt is not guaranteed on SDK messages, so _seq should be authoritative.
	const sorted = [...chunks]
		.map((chunk, index) => ({
			chunk,
			key: getChunkSortKey(chunk, index),
		}))
		.sort((a, b) => compareChunkSortKeys(a.key, b.key))
		.map(({ chunk }) => chunk);

	console.log(
		`[ai-chat/materialize] processing ${sorted.length} sorted chunks, types: ${sorted.map((c) => c.type).join(", ")}`,
	);

	const messages: MessageRow[] = [];
	let currentTurnChunks: ChunkRow[] = [];
	let lastRenderingType: string | null = null;

	for (const chunk of sorted) {
		const chunkType = chunk.type as string | undefined;

		// User input from client
		if (chunkType === "user_input") {
			// Flush current assistant turn
			if (currentTurnChunks.length > 0) {
				messages.push(materializeTurn(currentTurnChunks));
				currentTurnChunks = [];
				lastRenderingType = null;
			}
			messages.push({
				id: chunk.id,
				role: "user",
				content: String(chunk.content ?? ""),
				contentBlocks: [],
				toolResults: new Map(),
				actorId: String(chunk.actorId ?? ""),
				isComplete: true,
				isStreaming: false,
				createdAt: new Date(
					String(chunk.createdAt ?? new Date().toISOString()),
				),
			});
			continue;
		}

		// SDK message — only process rendering-relevant types for turns
		// Note: "result" is excluded — materializeTurn doesn't handle it,
		// and including it creates ghost streaming messages from lone result
		// chunks. It also masks the user→stream_event turn boundary.
		const isRenderingType =
			chunkType === "stream_event" ||
			chunkType === "assistant" ||
			chunkType === "user";

		if (!isRenderingType) continue;

		// Turn boundary: stream_event or assistant after user (tool result) = new turn
		if (
			lastRenderingType === "user" &&
			(chunkType === "stream_event" || chunkType === "assistant")
		) {
			if (currentTurnChunks.length > 0) {
				messages.push(materializeTurn(currentTurnChunks));
				currentTurnChunks = [];
			}
		}

		currentTurnChunks.push(chunk);
		lastRenderingType = chunkType;
	}

	// Flush remaining turn
	if (currentTurnChunks.length > 0) {
		messages.push(materializeTurn(currentTurnChunks));
	}

	return messages;
}

// ============================================================================
// Turn Materialization
// ============================================================================

/**
 * Materialize a single assistant turn from its SDK message chunks.
 */
function materializeTurn(chunks: ChunkRow[]): MessageRow {
	const firstChunk = chunks[0] as ChunkRow;

	console.log(
		`[ai-chat/materialize] materializeTurn: ${chunks.length} chunks, types: ${chunks.map((c) => c.type).join(", ")}`,
	);

	let assistantMsg: SDKAssistantMessage | null = null;
	const streamEvents: SDKPartialAssistantMessage[] = [];
	const userMsgs: SDKUserMessage[] = [];
	for (const chunk of chunks) {
		const msg = chunk as unknown as SDKMessage;
		switch (msg.type) {
			case "assistant":
				assistantMsg = msg;
				break;
			case "stream_event":
				streamEvents.push(msg);
				break;
			case "user":
				userMsgs.push(msg);
				break;
		}
	}

	// Build content blocks: prefer authoritative assistant message
	let contentBlocks: BetaContentBlock[];
	let isStreaming: boolean;

	if (assistantMsg) {
		contentBlocks = assistantMsg.message.content;
		isStreaming = false;
	} else {
		contentBlocks = buildBlocksFromStreamEvents(streamEvents);
		isStreaming = true;
	}

	// Build tool results from user messages (tool_result blocks)
	const toolResults = buildToolResults(userMsgs);

	// Join text blocks for backward-compat content field
	const content = contentBlocks
		.filter((b): b is BetaTextBlock => b.type === "text")
		.map((b) => b.text)
		.join("");

	console.log(
		`[ai-chat/materialize] turn result: id=${firstChunk.id.slice(0, 8)} hasAssistant=${!!assistantMsg} streamEvents=${streamEvents.length} userMsgs=${userMsgs.length} blocks=${contentBlocks.length} contentLen=${content.length} isComplete=${assistantMsg !== null} isStreaming=${isStreaming}`,
	);

	return {
		id: firstChunk.id,
		role: "assistant",
		content,
		contentBlocks,
		toolResults,
		actorId: "claude",
		isComplete: assistantMsg !== null,
		isStreaming,
		createdAt: firstChunk.createdAt
			? new Date(String(firstChunk.createdAt))
			: new Date(),
	};
}

// ============================================================================
// Tool Result Extraction
// ============================================================================

function buildToolResults(userMsgs: SDKUserMessage[]): Map<string, ToolResult> {
	const toolResults = new Map<string, ToolResult>();

	for (const userMsg of userMsgs) {
		const msgContent = userMsg.message.content;
		if (!Array.isArray(msgContent)) continue;

		for (const block of msgContent) {
			if (typeof block !== "object" || block === null) continue;
			if (!("type" in block) || block.type !== "tool_result") continue;

			const tr = block as {
				tool_use_id?: string;
				content?: string | Array<{ type: string; text?: string }>;
				is_error?: boolean;
			};
			if (!tr.tool_use_id) continue;

			let output = "";
			if (typeof tr.content === "string") {
				output = tr.content;
			} else if (Array.isArray(tr.content)) {
				output = tr.content
					.filter((c) => c.type === "text" && c.text)
					.map((c) => c.text as string)
					.join("");
			}

			toolResults.set(tr.tool_use_id, {
				output,
				isError: tr.is_error ?? false,
			});
		}
	}

	return toolResults;
}

// ============================================================================
// Stream Event Reconstruction
// ============================================================================

function buildBlocksFromStreamEvents(
	events: SDKPartialAssistantMessage[],
): BetaContentBlock[] {
	const blocks: BetaContentBlock[] = [];
	const jsonAccumulators = new Map<number, string>();

	for (const { event } of events) {
		switch (event.type) {
			case "content_block_start": {
				const e = event as BetaRawContentBlockStartEvent;
				blocks[e.index] = { ...e.content_block };
				if (e.content_block.type === "tool_use") {
					jsonAccumulators.set(e.index, "");
				}
				break;
			}

			case "content_block_delta": {
				const e = event as BetaRawContentBlockDeltaEvent;
				const block = blocks[e.index];
				if (!block) break;

				const delta = e.delta;
				if (delta.type === "text_delta" && block.type === "text") {
					(block as BetaTextBlock).text += delta.text;
				} else if (delta.type === "input_json_delta") {
					const accumulated =
						(jsonAccumulators.get(e.index) ?? "") + delta.partial_json;
					jsonAccumulators.set(e.index, accumulated);
					if (block.type === "tool_use") {
						try {
							(block as BetaToolUseBlock).input = JSON.parse(accumulated);
						} catch {
							// Partial JSON
						}
					}
				} else if (
					delta.type === "thinking_delta" &&
					block.type === "thinking"
				) {
					(block as { thinking: string }).thinking += delta.thinking;
				}
				break;
			}

			case "content_block_stop": {
				const index = (event as { index: number }).index;
				const accumulated = jsonAccumulators.get(index);
				const block = blocks[index];
				if (accumulated && block?.type === "tool_use") {
					try {
						(block as BetaToolUseBlock).input = JSON.parse(accumulated);
					} catch {
						// Best effort
					}
					jsonAccumulators.delete(index);
				}
				break;
			}
		}
	}

	return blocks.filter(Boolean);
}

// ============================================================================
// Helpers
// ============================================================================

export function isUserMessage(row: MessageRow): boolean {
	return row.role === "user";
}

export function isAssistantMessage(row: MessageRow): boolean {
	return row.role === "assistant";
}

function getChunkSortKey(chunk: ChunkRow, index: number): ChunkSortKey {
	const seq = typeof chunk._seq === "number" ? chunk._seq : null;
	const time = chunk.createdAt
		? new Date(String(chunk.createdAt)).getTime()
		: null;
	return { seq, time, index };
}

function compareChunkSortKeys(a: ChunkSortKey, b: ChunkSortKey): number {
	if (a.seq !== null || b.seq !== null) {
		if (a.seq === null) return 1;
		if (b.seq === null) return -1;
		if (a.seq !== b.seq) return a.seq - b.seq;
	}

	if (a.time !== null || b.time !== null) {
		if (a.time === null) return 1;
		if (b.time === null) return -1;
		if (a.time !== b.time) return a.time - b.time;
	}

	return a.index - b.index;
}
