/**
 * @electric-sql/durable-session
 *
 * Framework-agnostic durable chat client backed by TanStack DB and Durable Streams.
 *
 * This package provides:
 * - TanStack AI-compatible API for chat applications
 * - Durable persistence via Durable Streams
 * - Real-time sync across tabs, devices, and users
 * - Multi-agent support with webhook registration
 * - Reactive collections for custom UI needs
 *
 * Architecture:
 * - chunks → (subquery) → messages (root materialized collection)
 * - Derived collections filter messages via .fn.where() on parts
 * - All collections return MessageRow[], preserving full message context
 * - Consumers filter message.parts to access specific part types
 *
 * @example
 * ```typescript
 * import { DurableChatClient } from '@electric-sql/durable-session'
 *
 * const client = new DurableChatClient({
 *   sessionId: 'my-session',
 *   proxyUrl: 'http://localhost:4000',
 * })
 *
 * await client.connect()
 *
 * // TanStack AI-compatible API
 * await client.sendMessage('Hello!')
 * console.log(client.messages)
 *
 * // Access collections directly
 * for (const message of client.collections.messages.values()) {
 *   console.log(message.id, message.role, message.parts)
 * }
 *
 * // Filter tool calls from message parts
 * for (const message of client.collections.toolCalls.values()) {
 *   for (const part of message.parts) {
 *     if (part.type === 'tool-call') {
 *       console.log(part.name, part.state, part.arguments)
 *     }
 *   }
 * }
 *
 * // Check for pending approvals
 * for (const message of client.collections.pendingApprovals.values()) {
 *   for (const part of message.parts) {
 *     if (part.type === 'tool-call' && part.approval?.needsApproval) {
 *       console.log(`Approval needed: ${part.name}`)
 *     }
 *   }
 * }
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Client
// ============================================================================

export { DurableChatClient, createDurableChatClient } from './client'

// ============================================================================
// Schema (STATE-PROTOCOL)
// ============================================================================

export {
  sessionStateSchema,
  chunkValueSchema,
  presenceValueSchema,
  agentValueSchema,
  type SessionStateSchema,
  type ChunkValue,
  type ChunkRow,
  type PresenceValue,
  type RawPresenceRow,
  type PresenceRow,
  type AgentValue,
  type AgentRow,
} from './schema'

// ============================================================================
// Types
// ============================================================================

export type {
  // Actor types
  ActorType,

  // Message types
  MessageRole,
  MessageRow,

  // Re-exported TanStack AI types for consumer convenience
  MessagePart,
  TextPart,
  ToolCallPart,
  ToolResultPart,
  ThinkingPart,

  // Active generation types
  ActiveGenerationRow,

  // Session types
  ConnectionStatus,
  SessionMetaRow,
  SessionStatsRow,

  // Agent types
  AgentTrigger,
  AgentSpec,

  // Collection types
  DurableChatCollections,

  // Configuration types
  DurableChatClientOptions,
  SessionDBConfig,

  // Input types
  ToolResultInput,
  ApprovalResponseInput,

  // Fork types
  ForkOptions,
  ForkResult,
} from './types'

// ============================================================================
// Session DB Factory
// ============================================================================

export {
  createSessionDB,
  getChunkKey,
  parseChunkKey,
  type SessionDB,
} from './collection'

// ============================================================================
// Collection Factories
// ============================================================================

export {
  // Messages collection (root) and derived collections
  createMessagesCollection,
  createToolCallsCollection,
  createPendingApprovalsCollection,
  createToolResultsCollection,
  type MessagesCollectionOptions,
  type DerivedMessagesCollectionOptions,

  // Active generations collection
  createActiveGenerationsCollection,
  type ActiveGenerationsCollectionOptions,

  // Session metadata collection (local state)
  createSessionMetaCollectionOptions,
  createInitialSessionMeta,
  updateConnectionStatus,
  updateSyncProgress,
  type SessionMetaCollectionOptions,

  // Session statistics collection
  createSessionStatsCollection,
  computeSessionStats,
  createEmptyStats,
  type SessionStatsCollectionOptions,

  // Model messages collection (for LLM invocation)
  createModelMessagesCollection,
  type ModelMessage,
  type ModelMessagesCollectionOptions,

  // Aggregated presence collection
  createPresenceCollection,
  type PresenceCollectionOptions,
} from './collections'

// ============================================================================
// Materialization
// ============================================================================

export {
  materializeMessage,
  parseChunk,
  extractTextContent,
  isUserMessage,
  isAssistantMessage,
  messageRowToUIMessage,
} from './materialize'
