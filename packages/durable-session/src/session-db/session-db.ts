import {
	createStreamDB,
	type StreamDB,
	type StreamDBMethods,
} from "@durable-streams/state";
import type { Collection } from "@tanstack/db";
import {
	type AgentValue,
	type ChunkRow,
	type RawPresenceRow,
	sessionStateSchema,
} from "../schema";

export interface SessionDBConfig {
	sessionId: string;
	baseUrl: string;
	headers?: Record<string, string>;
	signal?: AbortSignal;
}

export interface SessionCollections {
	chunks: Collection<ChunkRow>;
	presence: Collection<RawPresenceRow>;
	agents: Collection<AgentValue>;
}

export type SessionDB = {
	collections: SessionCollections;
} & StreamDBMethods;

type RawSessionDB = StreamDB<typeof sessionStateSchema>;

export function createSessionDB(config: SessionDBConfig): SessionDB {
	const { sessionId, baseUrl, headers, signal } = config;
	const streamUrl = `${baseUrl}/${sessionId}/stream`;

	const rawDb: RawSessionDB = createStreamDB({
		streamOptions: {
			url: streamUrl,
			headers,
			signal,
		},
		state: sessionStateSchema,
	});

	return rawDb as unknown as SessionDB;
}
