/**
 * Session stream-db factory.
 *
 * Creates a stream-backed database using `@durable-streams/state` for syncing
 * a session's data from Durable Streams. This replaces the previous
 * `@tanstack/durable-stream-db-collection` approach.
 *
 * The resulting StreamDB provides typed collections (chunks, presence, agents)
 * that are automatically populated from the STATE-PROTOCOL events on the stream.
 */

import {
	createStreamDB,
	type StreamDB,
	type StreamDBMethods,
} from "@durable-streams/state";
import type { Collection } from "@tanstack/db";
import {
	type AgentRow,
	type ChunkRow,
	type RawPresenceRow,
	sessionStateSchema,
} from "./schema";
import type { SessionDBConfig } from "./types";

// ============================================================================
// Session StreamDB Types
// ============================================================================

/**
 * Collections map with correct row types.
 *
 * stream-db injects the primary key field at runtime, so ChunkRow and
 * RawPresenceRow include the `id` field even though it's not in the schema.
 * We define the correct types here.
 *
 * Note: The presence collection here is the raw per-device presence.
 * The aggregated per-actor presence is created in client.ts.
 */
export interface SessionCollections {
	chunks: Collection<ChunkRow>;
	presence: Collection<RawPresenceRow>;
	agents: Collection<AgentRow>;
}

/**
 * Type alias for a session stream-db instance.
 *
 * Provides typed access to:
 * - `db.collections.chunks` - All message chunks
 * - `db.collections.presence` - User/agent presence
 * - `db.collections.agents` - Registered agents
 *
 * Plus stream-db methods:
 * - `db.preload()` - Wait for initial sync
 * - `db.close()` - Cleanup resources
 * - `db.utils.awaitTxId(txid)` - Wait for specific write to sync
 */
export type SessionDB = {
	collections: SessionCollections;
} & StreamDBMethods;

/**
 * Internal type for the raw stream-db instance.
 * @internal
 */
type RawSessionDB = StreamDB<typeof sessionStateSchema>;

// ============================================================================
// Session StreamDB Factory
// ============================================================================

/**
 * Create a stream-db instance for a session.
 *
 * This function is synchronous - it creates the stream handle and collections
 * but does not start the stream connection. Call `db.preload()` to connect
 * and wait for the initial sync to complete.
 *
 * The returned SessionDB instance provides:
 * - `db.collections.chunks` - Root chunks collection (for messages)
 * - `db.collections.presence` - Presence tracking
 * - `db.collections.agents` - Registered agents
 *
 * @example
 * ```typescript
 * import { createSessionDB } from '@superset/durable-session'
 *
 * // Create stream-db for this session (synchronous)
 * const db = createSessionDB({
 *   sessionId: 'my-session',
 *   baseUrl: 'http://localhost:4000',
 * })
 *
 * // Wait for initial data sync
 * await db.preload()
 *
 * // Access typed collections
 * for (const chunk of db.collections.chunks.values()) {
 *   console.log(chunk.messageId, chunk.role, chunk.chunk)
 * }
 *
 * // Cleanup when done
 * db.close()
 * ```
 */
export function createSessionDB(config: SessionDBConfig): SessionDB {
	const { sessionId, baseUrl, headers, signal /* liveMode */ } = config;

	// Build the stream URL for this session
	const streamUrl = `${baseUrl}/v1/stream/sessions/${sessionId}`;

	// Create the stream-db instance with our session state schema (synchronous)
	const rawDb: RawSessionDB = createStreamDB({
		streamOptions: {
			url: streamUrl,
			headers,
			signal,
		},
		state: sessionStateSchema,
		// liveMode,
	});

	// Cast to our SessionDB type which has correctly typed collections
	// (stream-db injects the primary key at runtime, so our types reflect that)
	return rawDb as unknown as SessionDB;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get the primary key for a chunk (used for collection lookups).
 *
 * Key format: `${messageId}:${seq}`
 *
 * @param messageId - Message identifier
 * @param seq - Sequence number within message
 * @returns Primary key string
 */
export function getChunkKey(messageId: string, seq: number): string {
	return `${messageId}:${seq}`;
}

/**
 * Parse a chunk key into its components.
 *
 * @param key - Chunk key in format `${messageId}:${seq}`
 * @returns Parsed components or null if invalid
 */
export function parseChunkKey(
	key: string,
): { messageId: string; seq: number } | null {
	const lastColonIndex = key.lastIndexOf(":");
	if (lastColonIndex === -1) return null;

	const messageId = key.slice(0, lastColonIndex);
	const seqStr = key.slice(lastColonIndex + 1);
	const seq = parseInt(seqStr, 10);

	if (Number.isNaN(seq)) return null;

	return { messageId, seq };
}
