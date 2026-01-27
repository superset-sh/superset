/**
 * Message Materialization
 *
 * Converts raw stream chunks into structured messages.
 * Handles two formats:
 * 1. Whole messages: Single chunk with complete message content
 * 2. Streaming messages: Multiple chunks that need to be combined
 */

import type { StreamChunk } from "./schema";

/**
 * Message role types
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Chunk content types that can be stored in the stream
 */
export interface WholeMessageChunk {
	type: "whole-message";
	content: string;
}

export interface TextDeltaChunk {
	type: "text-delta";
	text: string;
}

export interface DoneChunk {
	type: "done";
}

export type ChunkContent = WholeMessageChunk | TextDeltaChunk | DoneChunk;

/**
 * Materialized message row
 */
export interface MessageRow {
	id: string;
	role: MessageRole;
	content: string;
	actorId: string;
	isComplete: boolean;
	createdAt: Date;
}

/**
 * Chunk row with injected id from the stream
 */
export type ChunkRow = StreamChunk & { id: string };

/**
 * Parse a JSON-encoded chunk string
 */
export function parseChunkContent(chunkJson: string): ChunkContent | null {
	try {
		return JSON.parse(chunkJson) as ChunkContent;
	} catch {
		return null;
	}
}

/**
 * Materialize a message from collected chunk rows
 *
 * Groups chunks by messageId, sorts by seq, and combines content.
 */
export function materializeMessage(rows: ChunkRow[]): MessageRow {
	if (!rows || rows.length === 0) {
		throw new Error("Cannot materialize message from empty rows");
	}

	// Sort by sequence number
	const sorted = [...rows].sort((a, b) => a.seq - b.seq);
	const first = sorted[0];

	// TypeScript can't infer that first is defined after the length check above
	if (!first) {
		throw new Error("Cannot materialize message from empty rows");
	}

	let content = "";
	let isComplete = false;

	for (const row of sorted) {
		const chunk = parseChunkContent(row.chunk);
		if (!chunk) continue;

		switch (chunk.type) {
			case "whole-message":
				content = chunk.content;
				isComplete = true;
				break;
			case "text-delta":
				content += chunk.text;
				break;
			case "done":
				isComplete = true;
				break;
		}
	}

	return {
		id: first.messageId,
		role: first.role,
		content,
		actorId: first.actorId,
		isComplete,
		createdAt: new Date(first.createdAt),
	};
}

/**
 * Check if a message is from a user
 */
export function isUserMessage(row: MessageRow): boolean {
	return row.role === "user";
}

/**
 * Check if a message is from an assistant
 */
export function isAssistantMessage(row: MessageRow): boolean {
	return row.role === "assistant";
}
