/**
 * Model messages collection - LLM-ready message history.
 *
 * Derives from the messages collection:
 * 1. Filters to complete messages only (isComplete === true)
 * 2. Converts to { role, content } format expected by LLMs
 * 3. Orders chronologically
 */

import type { Collection } from "@tanstack/db";
import { createLiveQueryCollection, eq } from "@tanstack/db";
import { extractTextContent } from "../materialize";
import type { MessageRow } from "../types";

// ============================================================================
// Types
// ============================================================================

/**
 * Message format expected by LLMs (OpenAI/Anthropic compatible).
 */
export interface ModelMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
}

/**
 * Options for creating a model messages collection.
 */
export interface ModelMessagesCollectionOptions {
	/** Messages collection (from createMessagesPipeline) */
	messagesCollection: Collection<MessageRow>;
}

// ============================================================================
// Factory
// ============================================================================

/**
 * Creates a collection of LLM-ready messages.
 *
 * This derived collection:
 * - Filters to complete messages only (streaming messages excluded)
 * - Extracts text content from message parts
 * - Provides chronologically ordered { role, content } objects
 *
 * @example
 * ```typescript
 * const { messages } = createMessagesPipeline({ ... })
 * const modelMessages = createModelMessagesCollection({
 *   messagesCollection: messages,
 * })
 *
 * // Get LLM-ready history
 * // Note: toArray is a getter (property), not a method
 * const history = modelMessages.toArray.map(m => ({
 *   role: m.role,
 *   content: m.content,
 * }))
 * ```
 */
export function createModelMessagesCollection(
	options: ModelMessagesCollectionOptions,
): Collection<ModelMessage> {
	const { messagesCollection } = options;

	return createLiveQueryCollection({
		query: (q) =>
			q
				.from({ message: messagesCollection })
				.where(({ message }) => eq(message.isComplete, true))
				.orderBy(({ message }) => message.createdAt, "asc")
				.fn.select(({ message }) => ({
					id: message.id,
					role: message.role,
					content: extractTextContent(message),
				})),
		getKey: (row) => row.id,
		startSync: true,
	});
}
