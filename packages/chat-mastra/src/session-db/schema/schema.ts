import { createStateSchema } from "@durable-streams/state";
import {
	type ChatMastraEnvelope,
	chatMastraEnvelopeSchema,
} from "../../schema";

export const chatMastraSessionStateSchema = createStateSchema({
	events: {
		schema: chatMastraEnvelopeSchema,
		type: "mastra-event",
		primaryKey: "id",
		allowSyncWhilePersisting: true,
	},
});

export type ChatMastraSessionStateSchema = typeof chatMastraSessionStateSchema;
export type ChatMastraEventRow = ChatMastraEnvelope & { id: string };
