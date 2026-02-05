/**
 * Collection exports for @electric-sql/durable-session
 *
 * Pipeline architecture:
 * - chunks → (subquery) → messages (root materialized collection)
 * - Derived collections filter messages via .fn.where() on parts
 *
 * All derived collections return MessageRow[], preserving full message context.
 * Consumers filter message.parts to access specific part types (ToolCallPart, etc.).
 */

// Messages collection (root) and derived collections
export {
  createMessagesCollection,
  createToolCallsCollection,
  createPendingApprovalsCollection,
  createToolResultsCollection,
  type MessagesCollectionOptions,
  type DerivedMessagesCollectionOptions,
} from './messages'

// Active generations collection (derived from messages)
export {
  createActiveGenerationsCollection,
  type ActiveGenerationsCollectionOptions,
} from './active-generations'

// Session metadata collection (local state)
export {
  createSessionMetaCollectionOptions,
  createInitialSessionMeta,
  updateConnectionStatus,
  updateSyncProgress,
  type SessionMetaCollectionOptions,
} from './session-meta'

// Session statistics collection (aggregated from chunks)
export {
  createSessionStatsCollection,
  computeSessionStats,
  createEmptyStats,
  type SessionStatsCollectionOptions,
} from './session-stats'

// Model messages collection (for LLM invocation)
export {
  createModelMessagesCollection,
  type ModelMessage,
  type ModelMessagesCollectionOptions,
} from './model-messages'

// Aggregated presence collection (derived from raw per-device presence)
export {
  createPresenceCollection,
  type PresenceCollectionOptions,
} from './presence'
