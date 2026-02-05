/**
 * Collection exports for @superset/durable-session
 *
 * Pipeline architecture:
 * - chunks → (subquery) → messages (root materialized collection)
 * - Derived collections filter messages via .fn.where() on parts
 *
 * All derived collections return MessageRow[], preserving full message context.
 * Consumers filter message.parts to access specific part types (ToolCallPart, etc.).
 */

// Active generations collection (derived from messages)
export {
	type ActiveGenerationsCollectionOptions,
	createActiveGenerationsCollection,
} from "./active-generations";
// Messages collection (root) and derived collections
export {
	createMessagesCollection,
	createPendingApprovalsCollection,
	createToolCallsCollection,
	createToolResultsCollection,
	type DerivedMessagesCollectionOptions,
	type MessagesCollectionOptions,
} from "./messages";
// Model messages collection (for LLM invocation)
export {
	createModelMessagesCollection,
	type ModelMessage,
	type ModelMessagesCollectionOptions,
} from "./model-messages";
// Aggregated presence collection (derived from raw per-device presence)
export {
	createPresenceCollection,
	type PresenceCollectionOptions,
} from "./presence";
// Session metadata collection (local state)
export {
	createInitialSessionMeta,
	createSessionMetaCollectionOptions,
	type SessionMetaCollectionOptions,
	updateConnectionStatus,
	updateSyncProgress,
} from "./session-meta";
// Session statistics collection (aggregated from chunks)
export {
	computeSessionStats,
	createEmptyStats,
	createSessionStatsCollection,
	type SessionStatsCollectionOptions,
} from "./session-stats";
