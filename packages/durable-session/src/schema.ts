/**
 * STATE-PROTOCOL schema definition for AI DB.
 *
 * Defines the collection schemas for a durable chat session using the
 * `@durable-streams/state` package's STATE-PROTOCOL.
 *
 * Each collection maps to a `type` field in change events streamed from
 * the Durable Streams server. The `primaryKey` specifies which field
 * receives the event's `key` value (injected by stream-db).
 *
 * @example
 * ```typescript
 * import { sessionStateSchema } from '@superset/durable-session'
 *
 * // Create insert event for a chunk
 * const event = sessionStateSchema.chunks.insert({
 *   key: `${messageId}:${seq}`,
 *   value: {
 *     messageId: 'msg-1',
 *     actorId: 'user-123',
 *     role: 'user',
 *     chunk: JSON.stringify({ type: 'message', message: {...} }),
 *     seq: 0,
 *     createdAt: new Date().toISOString(),
 *   },
 * })
 * ```
 */

import { createStateSchema } from "@durable-streams/state";
import { z } from "zod";

// ============================================================================
// Chunk Schema
// ============================================================================

/**
 * Chunk schema for all messages.
 *
 * Both complete messages (user input, cached messages) and streaming chunks
 * (assistant responses) use this schema. The difference is:
 *
 * - Complete messages: Single chunk with `{type: 'message', message: UIMessage}`
 * - Streaming chunks: Multiple chunks with TanStack AI StreamChunk types
 *
 * The `chunk` field is opaque JSON - parsing happens in materialize.ts.
 *
 * Key format: `${messageId}:${seq}` - e.g., "msg-1:0", "msg-2:5"
 */
export const chunkValueSchema = z.object({
	/** Message identifier - groups chunks belonging to the same message */
	messageId: z.string(),
	/** Actor who wrote this chunk */
	actorId: z.string(),
	/** Message role - aligns with TanStack AI UIMessage.role */
	role: z.enum(["user", "assistant", "system"]),
	/** JSON-encoded chunk content - could be WholeMessageChunk or StreamChunk */
	chunk: z.string(),
	/** Sequence number within message - monotonically increasing per messageId */
	seq: z.number(),
	/** ISO 8601 timestamp when chunk was created */
	createdAt: z.string(),
});

/** Inferred type for chunk values (without the injected `id` field) */
export type ChunkValue = z.infer<typeof chunkValueSchema>;

// ============================================================================
// Presence Schema
// ============================================================================

/**
 * Presence schema for tracking online users and agents.
 *
 * Uses upsert semantics with (actorId, deviceId) pairs.
 * Each tab/page load gets a unique deviceId.
 *
 * Key format: `${actorId}:${deviceId}` - e.g., "user-123:device-abc"
 */
export const presenceValueSchema = z.object({
	/** Actor identifier */
	actorId: z.string(),
	/** Device/tab identifier - unique per browser tab/page load */
	deviceId: z.string(),
	/** Actor type - 'user' or 'agent' */
	actorType: z.enum(["user", "agent"]),
	/** Optional display name */
	name: z.string().optional(),
	/** Current status */
	status: z.enum(["online", "offline", "away"]),
	/** ISO 8601 timestamp of last activity */
	lastSeenAt: z.string(),
});

/** Inferred type for presence values */
export type PresenceValue = z.infer<typeof presenceValueSchema>;

// ============================================================================
// Agent Schema
// ============================================================================

/**
 * Agent registration schema.
 *
 * Registered agents are invoked by the proxy when messages are added to
 * the session. The `triggers` field controls which messages trigger the agent.
 *
 * Key format: `${agentId}` - e.g., "claude-agent", "custom-tool"
 */
export const agentValueSchema = z.object({
	/** Agent identifier (same as key) */
	agentId: z.string(),
	/** Optional display name */
	name: z.string().optional(),
	/** Webhook endpoint URL */
	endpoint: z.string(),
	/** Trigger mode - when to invoke this agent */
	triggers: z.enum(["all", "user-messages"]).optional(),
});

/** Inferred type for agent values */
export type AgentValue = z.infer<typeof agentValueSchema>;

// ============================================================================
// Session State Schema
// ============================================================================

/**
 * Session state schema - defines all collection types for a chat session.
 *
 * This schema is used by both:
 * - **Client (ai-db)**: Passed to `createStreamDB()` to create typed collections
 * - **Proxy (ai-db-proxy)**: Used to create properly formatted change events
 *
 * Each key maps to:
 * - A STATE-PROTOCOL `type` field value
 * - A TanStack DB collection in the resulting StreamDB
 *
 * @example
 * ```typescript
 * // Client-side: Create stream-db with these collections
 * const db = createStreamDB({
 *   streamOptions: { url: '/v1/stream/sessions/my-session' },
 *   state: sessionStateSchema,
 * })
 *
 * // Access collections
 * const chunks = db.collections.chunks
 * const presence = db.collections.presence
 *
 * // Proxy-side: Create change events
 * const event = sessionStateSchema.chunks.insert({
 *   key: 'msg-1:0',
 *   value: { ... },
 * })
 * await stream.append(event)
 * ```
 */
export const sessionStateSchema = createStateSchema({
	/**
	 * Chunks collection - all message chunks (complete and streaming).
	 *
	 * Primary key `id` is injected from event.key = `${messageId}:${seq}`
	 */
	chunks: {
		schema: chunkValueSchema,
		type: "chunk",
		primaryKey: "id",
		allowSyncWhilePersisting: true,
	},

	/**
	 * Presence collection - online status of users and agents.
	 *
	 * Uses upsert semantics with (actorId, deviceId) pairs.
	 * Primary key `id` is injected from event.key = `${actorId}:${deviceId}`
	 * This follows the same pattern as chunks.
	 */
	presence: {
		schema: presenceValueSchema,
		type: "presence",
		primaryKey: "id",
	},

	/**
	 * Agents collection - registered webhook agents.
	 *
	 * Uses upsert semantics for registration. Primary key `agentId` from event.key.
	 */
	agents: {
		schema: agentValueSchema,
		type: "agent",
		primaryKey: "agentId",
	},
});

/** Type of the session state schema */
export type SessionStateSchema = typeof sessionStateSchema;

// ============================================================================
// Row Types (with injected primary keys)
// ============================================================================

/**
 * ChunkRow - a chunk value with the injected `id` primary key.
 *
 * This is the type of rows in `db.collections.chunks` after stream-db
 * injects the primary key from the event key.
 */
export type ChunkRow = ChunkValue & {
	/** Primary key - injected from event.key = `${messageId}:${seq}` */
	id: string;
};

/**
 * RawPresenceRow - a presence value with the injected `id` primary key.
 *
 * This is the type of rows in raw presence collection after stream-db
 * injects the primary key from the event key = `${actorId}:${deviceId}`
 *
 * This is the internal/raw type. For the public API, use PresenceRow
 * which is an aggregated view per actor.
 */
export type RawPresenceRow = PresenceValue & {
	/** Primary key - injected from event.key = `${actorId}:${deviceId}` */
	id: string;
};

/**
 * PresenceRow - aggregated presence per actor.
 *
 * This is the public type exposed to components. It aggregates
 * all devices for an actor into a single row showing who's online.
 */
export type PresenceRow = {
	/** Actor identifier */
	actorId: string;
	/** Actor type - 'user' or 'agent' */
	actorType: "user" | "agent";
	/** Optional display name */
	name?: string;
	/** All online device IDs for this actor */
	deviceIds: string[];
	/** Number of online devices */
	deviceCount: number;
};

/**
 * AgentRow - an agent value with the `agentId` key.
 * (Note: agentId is already in the schema, so this is the same as AgentValue)
 */
export type AgentRow = AgentValue;
