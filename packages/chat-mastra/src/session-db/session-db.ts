import type { DurableStreamOptions } from "@durable-streams/client";
import { createStreamDB, type StreamDB } from "@durable-streams/state";
import { chatMastraSessionStateSchema } from "./schema";

export interface ChatMastraSessionDBConfig {
	sessionId: string;
	baseUrl: string;
	headers?: DurableStreamOptions["headers"];
	fetch?: DurableStreamOptions["fetch"];
	signal?: AbortSignal;
}

export type ChatMastraSessionDB = StreamDB<typeof chatMastraSessionStateSchema>;

export function createChatMastraSessionDB(
	config: ChatMastraSessionDBConfig,
): ChatMastraSessionDB {
	const { sessionId, baseUrl, headers, fetch, signal } = config;
	const streamUrl = `${baseUrl}/${sessionId}/stream`;

	return createStreamDB({
		streamOptions: {
			url: streamUrl,
			headers,
			fetch,
			signal,
		},
		state: chatMastraSessionStateSchema,
	});
}
