/**
 * Messages collection - core live query pipeline.
 *
 * Architecture:
 * - chunks → (groupBy messageId + count/min) → fn.select(materialize)
 * - Derived collections use .fn.where() to filter by message parts
 *
 * Note: The upstream @tanstack/db `collect` aggregate is not yet published.
 * Instead, we use groupBy + count as a change discriminator, then
 * imperatively filter the chunks collection inside fn.select to gather
 * all chunks for each message.
 */

import type { ToolCallPart } from "@tanstack/ai";
import type { Collection } from "@tanstack/db";
import { count, createLiveQueryCollection, min } from "@tanstack/db";
import { materializeMessage } from "../materialize";
import type { ChunkRow } from "../schema";
import type { MessageRow } from "../types";

// ============================================================================
// Messages Collection (Root)
// ============================================================================

/**
 * Options for creating a messages collection.
 */
export interface MessagesCollectionOptions {
	/** Chunks collection from stream-db */
	chunksCollection: Collection<ChunkRow>;
}

/**
 * Creates the messages collection with inline subquery for chunk aggregation.
 *
 * This is the root materialized collection in the live query pipeline.
 * All derived collections (toolCalls, pendingApprovals, etc.) derive from this.
 *
 * Uses groupBy + count/min as change discriminators, then fn.select
 * imperatively gathers chunks from the collection per messageId.
 */
export function createMessagesCollection(
	options: MessagesCollectionOptions,
): Collection<MessageRow> {
	const { chunksCollection } = options;

	return createLiveQueryCollection({
		query: (q) => {
			// Subquery: group chunks by messageId with aggregates for change detection
			const grouped = q
				.from({ chunk: chunksCollection })
				.groupBy(({ chunk }) => chunk.messageId)
				.select(({ chunk }) => ({
					messageId: chunk.messageId,
					// min() handles strings (ISO 8601 sort lexicographically)
					startedAt: min(chunk.createdAt),
					// Count as discriminator to force re-evaluation when chunks change
					rowCount: count(chunk),
				}));

			// Main query: materialize messages from chunks
			return q
				.from({ grouped })
				.orderBy(({ grouped }) => grouped.startedAt, "asc")
				.fn.select(({ grouped }) => {
					// Imperatively gather all chunks for this messageId
					const rows = [...chunksCollection.values()].filter(
						(c) => (c as ChunkRow).messageId === grouped.messageId,
					) as ChunkRow[];
					return materializeMessage(rows);
				});
		},
		getKey: (row) => row.id,
	});
}

// ============================================================================
// Derived Collections
// ============================================================================

/**
 * Options for creating a derived collection from messages.
 */
export interface DerivedMessagesCollectionOptions {
	/** Messages collection to derive from */
	messagesCollection: Collection<MessageRow>;
}

/**
 * Creates a collection of messages that contain tool calls.
 *
 * Filters messages where at least one part has type 'tool-call'.
 * The collection is lazy - filtering only runs when accessed.
 */
export function createToolCallsCollection(
	options: DerivedMessagesCollectionOptions,
): Collection<MessageRow> {
	const { messagesCollection } = options;

	return createLiveQueryCollection({
		query: (q) =>
			q
				.from({ message: messagesCollection })
				.fn.where(({ message }) =>
					message.parts.some((p): p is ToolCallPart => p.type === "tool-call"),
				)
				.orderBy(({ message }) => message.createdAt, "asc"),
		getKey: (row) => row.id,
	});
}

/**
 * Creates a collection of messages that have pending approval requests.
 *
 * Filters messages where at least one tool call part has:
 * - approval.needsApproval === true
 * - approval.approved === undefined (not yet responded)
 */
export function createPendingApprovalsCollection(
	options: DerivedMessagesCollectionOptions,
): Collection<MessageRow> {
	const { messagesCollection } = options;

	return createLiveQueryCollection({
		query: (q) =>
			q
				.from({ message: messagesCollection })
				.fn.where(({ message }) =>
					message.parts.some(
						(p): p is ToolCallPart =>
							p.type === "tool-call" &&
							p.approval?.needsApproval === true &&
							p.approval.approved === undefined,
					),
				)
				.orderBy(({ message }) => message.createdAt, "asc"),
		getKey: (row) => row.id,
	});
}

/**
 * Creates a collection of messages that contain tool results.
 *
 * Filters messages where at least one part has type 'tool-result'.
 */
export function createToolResultsCollection(
	options: DerivedMessagesCollectionOptions,
): Collection<MessageRow> {
	const { messagesCollection } = options;

	return createLiveQueryCollection({
		query: (q) =>
			q
				.from({ message: messagesCollection })
				.fn.where(({ message }) =>
					message.parts.some((p) => p.type === "tool-result"),
				)
				.orderBy(({ message }) => message.createdAt, "asc"),
		getKey: (row) => row.id,
	});
}
