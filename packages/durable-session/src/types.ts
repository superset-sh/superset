import type { UIMessage, UIMessageChunk } from "ai";

/** Convenience alias — UIMessagePart is generic; this uses defaults. */
export type AnyUIMessagePart = UIMessage["parts"][number];

/**
 * Whole message chunk — stored as single row in stream.
 * Used for messages that are complete when written (user input, cached messages).
 */
export interface WholeMessageChunk {
	type: "whole-message";
	message: UIMessage & { createdAt?: string | Date };
}

/**
 * Union of all chunk types we handle.
 * - WholeMessageChunk: Complete messages (user input)
 * - UIMessageChunk: AI SDK streaming chunks (assistant responses)
 */
export type DurableStreamChunk = WholeMessageChunk | UIMessageChunk;

/**
 * Message role types (aligned with AI SDK UIMessage.role).
 */
export type MessageRole = "user" | "assistant" | "system";

/**
 * Materialized message row from stream.
 * Extends AI SDK's UIMessage with durable session metadata.
 */
export interface MessageRow {
	/** Message identifier (same as messageId from chunks) */
	id: string;
	/** Message role */
	role: MessageRole;
	/** Message parts — uses AI SDK's UIMessagePart types */
	parts: AnyUIMessagePart[];
	/** Actor identifier who wrote this message */
	actorId: string;
	/** Whether the message is complete (finish chunk received) */
	isComplete: boolean;
	/** Message creation timestamp (from first chunk) */
	createdAt: Date;
	/** Timestamp of the most recent chunk (for staleness detection) */
	lastChunkAt: Date;
}
