/**
 * Messages collection — core live query pipeline.
 *
 * Architecture:
 * - chunks -> (subquery: groupBy + count/min) -> messages
 * - fn.select scans source collection for matching chunks, then materializes
 * - fn.where filters out non-content messages (config, control, etc.)
 *
 * Since @tanstack/db@0.5.25 lacks `collect()`, we use a closure scan
 * over the chunksCollection to gather rows per messageId.
 */

import type { Collection } from "@tanstack/db";
import { count, createLiveQueryCollection, min } from "@tanstack/db";
import type { ChunkRow } from "../../../schema";
import type { MessageRow } from "../../types";
import { materializeMessage } from "./materialize";

/** Chunk types that are non-content signals — not real messages. */
const NON_CONTENT_TYPES = new Set([
	"config",
	"control",
	"tool-output",
	"approval-response",
	"tool-approval",
]);

/**
 * Returns true if this chunk group is a non-content event
 * (config, control, tool-output, approval-response) that should
 * not appear as a message in the UI.
 */
function isNonContentChunk(row: ChunkRow): boolean {
	try {
		const parsed = JSON.parse(row.chunk) as { type?: string };
		return NON_CONTENT_TYPES.has(parsed.type ?? "");
	} catch {
		return false;
	}
}

export interface MessagesCollectionOptions {
	chunksCollection: Collection<ChunkRow>;
}

/**
 * Creates the messages collection with groupBy + closure scan.
 *
 * `count(chunk.id)` changes on each new chunk -> triggers fn.select
 * re-evaluation for that group only. The fn.select closure scans
 * the source chunksCollection for all rows matching the messageId.
 *
 * Non-content events (config, control, tool-output, approval-response)
 * are filtered out so they don't render as empty bubbles.
 */
export function createMessagesCollection(
	options: MessagesCollectionOptions,
): Collection<MessageRow> {
	const { chunksCollection } = options;

	return createLiveQueryCollection({
		query: (q) => {
			const grouped = q
				.from({ chunk: chunksCollection })
				.groupBy(({ chunk }) => chunk.messageId)
				.select(({ chunk }) => ({
					messageId: chunk.messageId,
					rowCount: count(chunk.id),
					startedAt: min(chunk.createdAt),
				}));

			return q
				.from({ grouped })
				.orderBy(({ grouped }) => grouped.startedAt, "asc")
				.fn.where(({ grouped }) => {
					// Check the first chunk for this messageId — if it's a
					// non-content type, exclude the entire group.
					for (const row of chunksCollection.values()) {
						if (row.messageId === grouped.messageId) {
							return !isNonContentChunk(row);
						}
					}
					return false;
				})
				.fn.select(({ grouped }) => {
					const rows: ChunkRow[] = [];
					for (const row of chunksCollection.values()) {
						if (row.messageId === grouped.messageId) rows.push(row);
					}
					return materializeMessage(rows);
				});
		},
		getKey: (row) => row.id,
	}) as unknown as Collection<MessageRow>;
}
