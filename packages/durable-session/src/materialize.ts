/**
 * Message materialization from stream chunks.
 *
 * Handles two formats:
 * 1. User messages: Single row with {type: 'whole-message', message: UIMessage}
 * 2. Assistant messages: Multiple rows with TanStack AI StreamChunks
 *
 * Chunk processing is delegated to TanStack AI's StreamProcessor, which handles:
 * - Text content accumulation
 * - Tool call parsing (including arguments streaming)
 * - Tool result handling
 * - Approval request tracking
 *
 * The output is a MessageRow with parts using TanStack AI's MessagePart types.
 * Derived collections filter on these parts rather than using separate extraction.
 */

import type { StreamChunk, UIMessage } from "@tanstack/ai";
import { StreamProcessor } from "@tanstack/ai";
import type { ChunkRow } from "./schema";
import type {
	DurableStreamChunk,
	MessageRole,
	MessageRow,
	WholeMessageChunk,
} from "./types";

// ============================================================================
// Type Guards
// ============================================================================

function isDoneChunk(chunk: StreamChunk): boolean {
	return chunk.type === "RUN_FINISHED";
}

/**
 * Type guard for WholeMessageChunk.
 */
function isWholeMessageChunk(
	chunk: DurableStreamChunk | null,
): chunk is WholeMessageChunk {
	return chunk !== null && chunk.type === "whole-message";
}

// ============================================================================
// Message Materialization
// ============================================================================

/**
 * Parse a JSON-encoded chunk string.
 *
 * @param chunkJson - JSON string containing DurableStreamChunk
 * @returns Parsed chunk or null if invalid
 */
export function parseChunk(chunkJson: string): DurableStreamChunk | null {
	try {
		return JSON.parse(chunkJson) as DurableStreamChunk;
	} catch {
		return null;
	}
}

/**
 * Materialize a whole message from a single row.
 * User messages are stored as complete UIMessage objects.
 */
function materializeWholeMessage(
	row: ChunkRow,
	chunk: WholeMessageChunk,
): MessageRow {
	const { message } = chunk;

	return {
		id: message.id,
		role: message.role as MessageRole,
		parts: message.parts,
		actorId: row.actorId,
		isComplete: true,
		createdAt: message.createdAt
			? new Date(message.createdAt)
			: new Date(row.createdAt),
	};
}

/**
 * Materialize an assistant message from streamed chunks.
 * Uses TanStack AI's StreamProcessor to process chunks.
 */
function materializeAssistantMessage(rows: ChunkRow[]): MessageRow {
	const sorted = [...rows].sort((a, b) => a.seq - b.seq);
	const first = sorted[0] as ChunkRow;

	// Create processor and start assistant message
	const processor = new StreamProcessor();
	processor.startAssistantMessage();

	let isComplete = false;

	for (const row of sorted) {
		const chunk = parseChunk(row.chunk);
		if (!chunk) continue;

		// Extract type as string for legacy/proxy chunk type checks
		const type = (chunk as { type: string }).type as string;

		// Skip legacy wrapper chunks (for backward compatibility)
		if (type === "message-start" || type === "message-end") {
			if (type === "message-end") {
				isComplete = true;
			}
			continue;
		}

		// Skip whole-message chunks (shouldn't be in assistant messages, but guard)
		if (isWholeMessageChunk(chunk)) continue;

		// Process TanStack AI StreamChunk
		try {
			processor.processChunk(chunk as StreamChunk);
		} catch {
			// Skip chunks that can't be processed
		}

		if (isDoneChunk(chunk as StreamChunk)) {
			isComplete = true;
		}

		// Also check for stop/error chunks (stop is from our proxy, not in TanStack AI types)
		if (type === "stop" || type === "error" || type === "RUN_ERROR") {
			isComplete = true;
		}
	}

	// Finalize if complete
	if (isComplete) {
		processor.finalizeStream();
	}

	// Get the materialized UIMessage
	const messages = processor.getMessages();
	const message = messages[messages.length - 1];

	return {
		id: first.messageId,
		role: first.role as MessageRole,
		parts: message?.parts ?? [],
		actorId: first.actorId,
		isComplete,
		createdAt: new Date(first.createdAt),
	};
}

/**
 * Materialize a MessageRow from collected chunk rows.
 *
 * Handles two formats:
 * 1. User messages: Single row with {type: 'whole-message', message: UIMessage}
 * 2. Assistant messages: Multiple rows with TanStack AI StreamChunks
 *
 * @param rows - Chunk rows for a single message
 * @returns Materialized message row
 */
export function materializeMessage(rows: ChunkRow[]): MessageRow {
	if (!rows || rows.length === 0) {
		throw new Error("Cannot materialize message from empty rows");
	}

	// Sort by seq to ensure correct order
	const sorted = [...rows].sort((a, b) => a.seq - b.seq);
	const firstRow = sorted[0] as ChunkRow;
	const firstChunk = parseChunk(firstRow.chunk);

	if (!firstChunk) {
		throw new Error("Failed to parse first chunk");
	}

	// Check if this is a whole message
	if (isWholeMessageChunk(firstChunk)) {
		return materializeWholeMessage(firstRow, firstChunk);
	}

	// Otherwise, process as streamed assistant message
	return materializeAssistantMessage(sorted);
}

// ============================================================================
// Content Extraction Helpers
// ============================================================================

/**
 * Extract text content from a UIMessage or MessageRow.
 *
 * @param message - Message to extract from
 * @returns Combined text content
 */
export function extractTextContent(message: {
	parts: Array<{ type: string; text?: string; content?: string }>;
}): string {
	return message.parts
		.filter((p) => p.type === "text")
		.map((p) => p.text ?? p.content ?? "")
		.join("");
}

/**
 * Check if a message row is from a user.
 *
 * @param row - Message row to check
 * @returns Whether the message is from a user
 */
export function isUserMessage(row: MessageRow): boolean {
	return row.role === "user";
}

/**
 * Check if a message row is from an assistant/agent.
 *
 * @param row - Message row to check
 * @returns Whether the message is from an assistant
 */
export function isAssistantMessage(row: MessageRow): boolean {
	return row.role === "assistant";
}

// ============================================================================
// UIMessage Conversion
// ============================================================================

/**
 * Convert a MessageRow to a TanStack AI UIMessage.
 *
 * This is a pure transformation function that maps the internal MessageRow
 * representation to the public UIMessage interface expected by TanStack AI.
 *
 * @param row - MessageRow from the messages collection
 * @returns UIMessage compatible with TanStack AI
 */
export function messageRowToUIMessage(
	row: MessageRow,
): UIMessage & { actorId: string } {
	return {
		id: row.id,
		role: row.role,
		parts: row.parts,
		createdAt: row.createdAt,
		actorId: row.actorId,
	};
}
