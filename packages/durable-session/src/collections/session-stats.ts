/**
 * Session statistics collection - aggregated from chunks.
 *
 * Computes aggregate statistics from the stream by:
 * 1. Counting all chunks for the session (as change discriminator)
 * 2. Imperatively grouping by messageId and computing stats
 *
 * Uses TanStack AI's MessagePart types for type-safe filtering.
 */

import type { ToolCallPart } from "@tanstack/ai";
import type { Collection } from "@tanstack/db";
import { count, createLiveQueryCollection } from "@tanstack/db";
import { materializeMessage, parseChunk } from "../materialize";
import type { ChunkRow } from "../schema";
import type { MessageRow, SessionStatsRow } from "../types";

// ============================================================================
// Session Stats Collection
// ============================================================================

/**
 * Options for creating a session stats collection.
 */
export interface SessionStatsCollectionOptions {
	/** Session identifier */
	sessionId: string;
	/** Chunks collection from stream-db */
	chunksCollection: Collection<ChunkRow>;
}

/**
 * Creates the session stats collection.
 *
 * Uses groupBy with count as a change discriminator, then fn.select
 * imperatively gathers all chunks and computes stats.
 */
export function createSessionStatsCollection(
	options: SessionStatsCollectionOptions,
): Collection<SessionStatsRow> {
	const { sessionId, chunksCollection } = options;

	// Single-stage: group by sessionId (constant), count for change detection, compute stats in fn.select
	const collectedRows = createLiveQueryCollection({
		query: (q) =>
			q
				.from({ chunk: chunksCollection })
				.groupBy(() => sessionId)
				.select(({ chunk }) => ({
					sessionId,
					rowCount: count(chunk),
				})),
	});

	return createLiveQueryCollection({
		query: (q) =>
			q.from({ collected: collectedRows }).fn.select(({ collected }) => {
				// Imperatively gather all chunks
				const rows = [...chunksCollection.values()] as ChunkRow[];
				return computeSessionStats(collected.sessionId as string, rows);
			}),
	});
}

/**
 * Group chunk rows by messageId.
 */
function groupRowsByMessage(rows: ChunkRow[]): Map<string, ChunkRow[]> {
	const grouped = new Map<string, ChunkRow[]>();

	for (const row of rows) {
		const existing = grouped.get(row.messageId);
		if (existing) {
			existing.push(row);
		} else {
			grouped.set(row.messageId, [row]);
		}
	}

	return grouped;
}

/**
 * Compute session statistics from chunk rows.
 *
 * Materializes messages and counts parts by type to derive statistics.
 *
 * @param sessionId - Session identifier
 * @param rows - All chunk rows
 * @returns Computed statistics
 */
export function computeSessionStats(
	sessionId: string,
	rows: ChunkRow[],
): SessionStatsRow {
	if (rows.length === 0) {
		return createEmptyStats(sessionId);
	}

	// Group rows by message
	const grouped = groupRowsByMessage(rows);

	// Materialize messages for counting
	const messages: MessageRow[] = [];
	for (const [, messageRows] of grouped) {
		try {
			messages.push(materializeMessage(messageRows));
		} catch {
			// Skip invalid messages
		}
	}

	// Count message types and extract part counts
	let userMessageCount = 0;
	let assistantMessageCount = 0;
	let toolCallCount = 0;
	let pendingApprovalCount = 0;
	let activeGenerationCount = 0;
	let firstMessageAt: Date | null = null;
	let lastMessageAt: Date | null = null;

	for (const msg of messages) {
		// Count by role
		if (msg.role === "user") {
			userMessageCount++;
		} else if (msg.role === "assistant") {
			assistantMessageCount++;
		}

		// Track timestamps
		if (!firstMessageAt || msg.createdAt < firstMessageAt) {
			firstMessageAt = msg.createdAt;
		}
		if (!lastMessageAt || msg.createdAt > lastMessageAt) {
			lastMessageAt = msg.createdAt;
		}

		// Count tool calls and pending approvals from parts
		for (const part of msg.parts) {
			if (part.type === "tool-call") {
				toolCallCount++;
				const toolCallPart = part as ToolCallPart;
				if (
					toolCallPart.approval?.needsApproval === true &&
					toolCallPart.approval.approved === undefined
				) {
					pendingApprovalCount++;
				}
			}
		}

		// Count active generations (incomplete messages)
		if (!msg.isComplete) {
			activeGenerationCount++;
		}
	}

	// Extract token usage from chunks
	const { totalTokens, promptTokens, completionTokens } =
		extractTokenUsage(rows);

	return {
		sessionId,
		messageCount: messages.length,
		userMessageCount,
		assistantMessageCount,
		toolCallCount,
		approvalCount: pendingApprovalCount,
		totalTokens,
		promptTokens,
		completionTokens,
		activeGenerationCount,
		firstMessageAt,
		lastMessageAt,
	};
}

/**
 * Extract token usage from chunk rows.
 *
 * @param rows - Chunk rows to extract from
 * @returns Token usage counts
 */
function extractTokenUsage(rows: ChunkRow[]): {
	totalTokens: number;
	promptTokens: number;
	completionTokens: number;
} {
	let totalTokens = 0;
	let promptTokens = 0;
	let completionTokens = 0;

	for (const row of rows) {
		const chunk = parseChunk(row.chunk);
		if (!chunk) continue;

		// Look for usage information in chunks
		const usage = (
			chunk as {
				usage?: {
					totalTokens?: number;
					promptTokens?: number;
					completionTokens?: number;
					total_tokens?: number;
					prompt_tokens?: number;
					completion_tokens?: number;
				};
			}
		).usage;

		if (usage) {
			// Handle both camelCase and snake_case formats
			totalTokens += usage.totalTokens ?? usage.total_tokens ?? 0;
			promptTokens += usage.promptTokens ?? usage.prompt_tokens ?? 0;
			completionTokens +=
				usage.completionTokens ?? usage.completion_tokens ?? 0;
		}
	}

	return { totalTokens, promptTokens, completionTokens };
}

/**
 * Create empty session statistics.
 *
 * @param sessionId - Session identifier
 * @returns Empty statistics row
 */
export function createEmptyStats(sessionId: string): SessionStatsRow {
	return {
		sessionId,
		messageCount: 0,
		userMessageCount: 0,
		assistantMessageCount: 0,
		toolCallCount: 0,
		approvalCount: 0,
		totalTokens: 0,
		promptTokens: 0,
		completionTokens: 0,
		activeGenerationCount: 0,
		firstMessageAt: null,
		lastMessageAt: null,
	};
}
