/**
 * Durable Streams State Schema
 *
 * Defines the state protocol schemas for real-time chat streaming with TanStack DB.
 * Uses @durable-streams/state for protocol-compliant state management.
 */

import { createStateSchema } from "@durable-streams/state";
import { z } from "zod";

/**
 * Chunk schema - individual message tokens/chunks for streaming
 * Similar to Electric's example pattern for real-time AI chat
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
 */
export const presenceSchema = z.object({
	userId: z.string(),
	userName: z.string(),
	deviceId: z.string(),
	status: z.enum(["online", "typing", "idle", "offline"]),
	lastSeen: z.string().optional(),
});

export type StreamPresence = z.infer<typeof presenceSchema>;

/**
 * Draft schema - user draft messages
 */
export const draftSchema = z.object({
	userId: z.string(),
	userName: z.string(),
	content: z.string(),
	updatedAt: z.string(),
});

export type StreamDraft = z.infer<typeof draftSchema>;

/**
 * Message schema - complete messages (used for full message sync)
 */
export const messageSchema = z.object({
	id: z.string(),
	sessionId: z.string(),
	role: z.enum(["user", "assistant", "system"]),
	content: z.string(),
	toolCalls: z.array(z.unknown()).optional(),
	inputTokens: z.number().optional(),
	outputTokens: z.number().optional(),
	actorId: z.string(),
	isComplete: z.boolean(),
	createdAt: z.string(),
});

export type StreamMessage = z.infer<typeof messageSchema>;

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
		primaryKey: "id", // Injected as `${messageId}:${seq}`
	},
	presence: {
		schema: presenceSchema,
		type: "presence",
		primaryKey: "id", // Injected as `${userId}:${deviceId}`
	},
	drafts: {
		schema: draftSchema,
		type: "draft",
		primaryKey: "userId",
	},
	messages: {
		schema: messageSchema,
		type: "message",
		primaryKey: "id",
	},
});

export type SessionStateSchema = typeof sessionStateSchema;
