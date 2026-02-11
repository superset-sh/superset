/**
 * Active generations collection - derived from messages.
 *
 * Tracks messages that are currently being streamed (have chunks but no finish chunk).
 * This is derived from the messages collection by filtering for incomplete messages.
 *
 * This follows the pattern: derive from materialized data with fn.select
 */

import type { Collection } from "@tanstack/db";
import { createLiveQueryCollection } from "@tanstack/db";
import type { ActiveGenerationRow, MessageRow } from "../types";

// ============================================================================
// Active Generations Collection
// ============================================================================

/**
 * Options for creating an active generations collection.
 */
export interface ActiveGenerationsCollectionOptions {
	/** Messages collection to derive from */
	messagesCollection: Collection<MessageRow>;
}

/**
 * Convert an incomplete message to an active generation row.
 */
function messageToActiveGeneration(message: MessageRow): ActiveGenerationRow {
	return {
		messageId: message.id,
		actorId: message.actorId,
		startedAt: message.createdAt,
		lastChunkSeq: 0, // We don't track seq in messages, so use 0 as placeholder
		lastChunkAt: message.createdAt,
	};
}

/**
 * Creates the active generations collection from messages.
 *
 * Filters messages to only include incomplete ones (isComplete === false)
 * and transforms them into ActiveGenerationRow format.
 *
 * Active generations are useful for:
 * - Showing typing indicators
 * - Tracking streaming progress
 * - Resuming interrupted generations
 *
 * @example
 * ```typescript
 * const activeGenerations = createActiveGenerationsCollection({
 *   sessionId: 'my-session',
 *   messagesCollection,
 * })
 *
 * // Check if anything is generating
 * const isLoading = activeGenerations.size > 0
 *
 * // Access active generations directly
 * for (const gen of activeGenerations.values()) {
 *   console.log(gen.messageId, gen.actorId, gen.startedAt)
 * }
 * ```
 */
export function createActiveGenerationsCollection(
	options: ActiveGenerationsCollectionOptions,
): Collection<ActiveGenerationRow> {
	const { messagesCollection } = options;

	// Filter messages for incomplete ones and transform to ActiveGenerationRow
	// Order by createdAt to ensure chronological ordering
	return createLiveQueryCollection({
		query: (q) =>
			q
				.from({ message: messagesCollection })
				.orderBy(({ message }) => message.createdAt, "asc")
				.fn.where(({ message }) => !message.isComplete)
				.fn.select(({ message }) => messageToActiveGeneration(message)),
	});
}
