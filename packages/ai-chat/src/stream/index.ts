/**
 * Stream module exports
 */

export {
	createSessionActions,
	createStream,
	type SessionActions,
	type SessionUser,
} from "./actions";
export {
	type ConnectionStatus,
	createDurableChatClient,
	DurableChatClient,
	type DurableChatClientOptions,
	type SessionCollections,
} from "./client";
export {
	type ChunkContent,
	type ChunkRow,
	type MessageRole,
	type MessageRow,
	materializeMessage,
} from "./materialize";
export {
	type SessionStateSchema,
	type StreamChunk,
	type StreamDraft,
	type StreamPresence,
	sessionStateSchema,
} from "./schema";
export {
	type ChatUser,
	type UseChatSessionOptions,
	type UseChatSessionReturn,
	useChatSession,
} from "./useChatSession";
export { useCollectionData } from "./useCollectionData";
