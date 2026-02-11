/**
 * @superset/durable-session
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
 * import { DurableChatClient } from '@superset/durable-session'
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

export { createDurableChatClient, DurableChatClient } from "./client";
export { StreamError } from "./errors";

// ============================================================================
// Schema (STATE-PROTOCOL)
// ============================================================================

export {
	type AgentRow,
	type AgentValue,
	agentValueSchema,
	type ChunkRow,
	type ChunkValue,
	chunkValueSchema,
	type PresenceRow,
	type PresenceValue,
	presenceValueSchema,
	type RawPresenceRow,
	type SessionStateSchema,
	sessionStateSchema,
} from "./schema";

// ============================================================================
// Types
// ============================================================================

export type {
	// Active generation types
	ActiveGenerationRow,
	// Actor types
	ActorType,
	AgentSpec,
	// Agent types
	AgentTrigger,
	AnswerResponseInput,
	ApprovalResponseInput,
	// Session types
	ConnectionStatus,
	// Configuration types
	DurableChatClientOptions,
	// Collection types
	DurableChatCollections,
	// Fork types
	ForkOptions,
	ForkResult,
	// Re-exported TanStack AI types for consumer convenience
	MessagePart,
	// Message types
	MessageRole,
	MessageRow,
	SessionDBConfig,
	SessionMetaRow,
	SessionStatsRow,
	TextPart,
	ThinkingPart,
	ToolCallPart,
	// Input types
	ToolResultInput,
	ToolResultPart,
	UIMessage,
} from "./types";

// ============================================================================
// Session DB Factory
// ============================================================================

export {
	createSessionDB,
	getChunkKey,
	parseChunkKey,
	type SessionDB,
} from "./collection";

// ============================================================================
// Collection Factories
// ============================================================================

export {
	type ActiveGenerationsCollectionOptions,
	computeSessionStats,
	// Active generations collection
	createActiveGenerationsCollection,
	createEmptyStats,
	createInitialSessionMeta,
	// Messages collection (root) and derived collections
	createMessagesCollection,
	// Model messages collection (for LLM invocation)
	createModelMessagesCollection,
	createPendingApprovalsCollection,
	// Aggregated presence collection
	createPresenceCollection,
	// Session metadata collection (local state)
	createSessionMetaCollectionOptions,
	// Session statistics collection
	createSessionStatsCollection,
	createToolCallsCollection,
	createToolResultsCollection,
	type DerivedMessagesCollectionOptions,
	type MessagesCollectionOptions,
	type ModelMessage,
	type ModelMessagesCollectionOptions,
	type PresenceCollectionOptions,
	type SessionMetaCollectionOptions,
	type SessionStatsCollectionOptions,
	updateConnectionStatus,
	updateSyncProgress,
} from "./collections";

// ============================================================================
// Materialization
// ============================================================================

export {
	extractTextContent,
	isAssistantMessage,
	isUserMessage,
	materializeMessage,
	messageRowToUIMessage,
	parseChunk,
} from "./materialize";

// ============================================================================
// Stream Utilities
// ============================================================================

export { createTextSegmentEnricher } from "./enrich-text-segments";
