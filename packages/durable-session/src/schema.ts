import { createStateSchema } from "@durable-streams/state";
import { z } from "zod";

// chunk field stores JSON-encoded UIMessageChunk (AI SDK) objects
export const chunkValueSchema = z.object({
	messageId: z.string(),
	actorId: z.string(),
	role: z.enum(["user", "assistant", "system"]),
	chunk: z.string(),
	seq: z.number(),
	createdAt: z.string(),
});

export type ChunkValue = z.infer<typeof chunkValueSchema>;

export const presenceValueSchema = z.object({
	userId: z.string(),
	deviceId: z.string(),
	name: z.string().optional(),
	status: z.enum(["active", "idle", "typing", "offline"]),
	lastSeenAt: z.string(),
	draft: z.string().optional(),
	cursorPosition: z.number().optional(),
});

export type PresenceValue = z.infer<typeof presenceValueSchema>;

export const agentValueSchema = z.object({
	agentId: z.string(),
	name: z.string().optional(),
	endpoint: z.string(),
	triggers: z.enum(["all", "user-messages"]).optional(),
	model: z.string().optional(),
	generationMessageId: z.string().optional(),
});

export type AgentValue = z.infer<typeof agentValueSchema>;

export const sessionStateSchema = createStateSchema({
	chunks: {
		schema: chunkValueSchema,
		type: "chunk",
		primaryKey: "id",
		allowSyncWhilePersisting: true,
	},
	presence: {
		schema: presenceValueSchema,
		type: "presence",
		primaryKey: "id",
	},
	agents: {
		schema: agentValueSchema,
		type: "agent",
		primaryKey: "agentId",
	},
});

export type SessionStateSchema = typeof sessionStateSchema;

// Row types include the `id` primary key injected by StreamDB from event.key
export type ChunkRow = ChunkValue & { id: string };
export type RawPresenceRow = PresenceValue & { id: string };
