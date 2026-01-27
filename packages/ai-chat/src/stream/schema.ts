/**
 * Durable Streams State Schema
 *
 * Defines the state protocol schemas for real-time chat streaming with TanStack DB.
 * Uses @durable-streams/state for protocol-compliant state management.
 *
 * Simplified design:
 * - Presence = who's in the room (no status field - typing is derived from drafts)
 * - Drafts = content being typed (non-empty content = user is typing)
 * - Chunks = streaming message tokens
 */

import { createStateSchema } from "@durable-streams/state";
import { z } from "zod";

/**
 * Chunk schema - individual message tokens/chunks for streaming
 */
export const chunkSchema = z.object({
	messageId: z.string(),
	actorId: z.string(),
	role: z.enum(["user", "assistant", "system"]),
	chunk: z.string(),
	seq: z.number(),
	createdAt: z.string(),
});

export type StreamChunk = z.infer<typeof chunkSchema>;

/**
 * Presence schema - user presence tracking
 *
 * Simplified: No status field. Typing is derived from drafts with non-empty content.
 */
export const presenceSchema = z.object({
	userId: z.string(),
	userName: z.string(),
	joinedAt: z.string(),
});

export type StreamPresence = z.infer<typeof presenceSchema>;

/**
 * Draft schema - user draft messages
 *
 * Non-empty content = user is typing.
 */
export const draftSchema = z.object({
	userId: z.string(),
	userName: z.string(),
	content: z.string(),
	cursorPosition: z.number().optional(),
	updatedAt: z.string(),
});

export type StreamDraft = z.infer<typeof draftSchema>;

/**
 * Combined session state schema
 *
 * This creates a typed schema that routes different event types
 * to their respective TanStack DB collections.
 */
export const sessionStateSchema = createStateSchema({
	chunks: {
		schema: chunkSchema,
		type: "chunk",
		primaryKey: "id",
	},
	presence: {
		schema: presenceSchema,
		type: "presence",
		primaryKey: "userId",
	},
	drafts: {
		schema: draftSchema,
		type: "draft",
		primaryKey: "userId",
	},
});

export type SessionStateSchema = typeof sessionStateSchema;
