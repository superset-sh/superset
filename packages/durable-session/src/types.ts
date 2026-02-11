/**
 * Core type definitions for @superset/durable-session
 *
 * Defines the stream protocol types, collection schemas, and API interfaces.
 *
 * Design principles:
 * - Use TanStack AI types directly (MessagePart, ToolCallPart, etc.)
 * - Single MessageRow type for all materialized messages
 * - Derived collections filter on message parts, not custom row types
 */

import type {
	AnyClientTool,
	MessagePart,
	StreamChunk,
	UIMessage,
} from "@tanstack/ai";
import type { Collection } from "@tanstack/db";
import type { SessionDB } from "./collection";

// Re-export TanStack AI message part types for consumer convenience
export type {
	MessagePart,
	TextPart,
	ThinkingPart,
	ToolCallPart,
	ToolResultPart,
	UIMessage,
} from "@tanstack/ai";
// Re-export schema types
export type { AgentRow, ChunkRow, ChunkValue, PresenceRow } from "./schema";

// ============================================================================
// Stream Protocol Types
// ============================================================================

/**
 * Whole message chunk - stored as single row in stream.
 * Used for messages that are complete when written (user input, cached messages).
 *
 * This is different from TanStack AI's StreamChunk types, which are designed
 * for streaming assistant responses. Whole messages are complete when sent,
 * so we store them as complete UIMessage objects.
 */
export interface WholeMessageChunk {
	type: "whole-message";
	message: UIMessage;
}

/**
 * Union of all chunk types we handle.
 * - WholeMessageChunk: Complete messages (user input)
 * - StreamChunk: TanStack AI streaming chunks (assistant responses)
 */
export type DurableStreamChunk = WholeMessageChunk | StreamChunk;

/**
 * Actor types in the chat session.
 */
export type ActorType = "user" | "agent";

/**
 * Message role types (aligned with TanStack AI UIMessage.role).
 */
export type MessageRole = "user" | "assistant" | "system";

// ============================================================================
// Message Collection Types
// ============================================================================

/**
 * Materialized message row from stream.
 *
 * Extends TanStack AI's UIMessage with durable session metadata.
 * Messages are materialized from ChunkRow arrays via the live query pipeline.
 *
 * Message parts use TanStack AI's discriminated union types directly:
 * - TextPart: { type: 'text', content: string }
 * - ToolCallPart: { type: 'tool-call', id, name, arguments, state, approval?, output? }
 * - ToolResultPart: { type: 'tool-result', toolCallId, content, state, error? }
 * - ThinkingPart: { type: 'thinking', content: string }
 *
 * @example
 * ```typescript
 * // Filter for tool calls in a message
 * const toolCalls = message.parts.filter(
 *   (p): p is ToolCallPart => p.type === 'tool-call'
 * )
 *
 * // Check for pending approvals
 * const pendingApprovals = toolCalls.filter(
 *   tc => tc.approval?.needsApproval && tc.approval.approved === undefined
 * )
 * ```
 */
export interface MessageRow {
	/** Message identifier (same as messageId from chunks) */
	id: string;
	/** Message role */
	role: MessageRole;
	/** Message parts - uses TanStack AI's MessagePart type directly */
	parts: MessagePart[];
	/** Actor identifier who wrote this message */
	actorId: string;
	/** Whether the message is complete (finish chunk received) */
	isComplete: boolean;
	/** Message creation timestamp (from first chunk) */
	createdAt: Date;
}

// ============================================================================
// Active Generation Types
// ============================================================================

/**
 * Messages currently being streamed (have chunks but no finish chunk).
 */
export interface ActiveGenerationRow {
	/** The message being generated */
	messageId: string;
	/** Actor identifier */
	actorId: string;
	/** When generation started */
	startedAt: Date;
	/** Last chunk sequence number */
	lastChunkSeq: number;
	/** When last chunk was received */
	lastChunkAt: Date;
}

// ============================================================================
// Session Metadata Types
// ============================================================================

/**
 * Connection status states.
 */
export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

/**
 * Session metadata row (local state only, not derived from stream).
 */
export interface SessionMetaRow {
	/** Session identifier */
	sessionId: string;
	/** Current connection status */
	connectionStatus: ConnectionStatus;
	/** Last synced transaction ID (for txid tracking) */
	lastSyncedTxId: string | null;
	/** Last sync timestamp */
	lastSyncedAt: Date | null;
	/** Error information if any */
	error: { message: string; code?: string } | null;
}

// ============================================================================
// Session Statistics Types
// ============================================================================

/**
 * Aggregate session statistics row.
 */
export interface SessionStatsRow {
	/** Session identifier */
	sessionId: string;
	/** Total message count */
	messageCount: number;
	/** User message count */
	userMessageCount: number;
	/** Assistant message count */
	assistantMessageCount: number;
	/** Total tool call count */
	toolCallCount: number;
	/** Total approval count */
	approvalCount: number;
	/** Total tokens used */
	totalTokens: number;
	/** Prompt tokens used */
	promptTokens: number;
	/** Completion tokens used */
	completionTokens: number;
	/** Currently active generation count */
	activeGenerationCount: number;
	/** First message timestamp */
	firstMessageAt: Date | null;
	/** Last message timestamp */
	lastMessageAt: Date | null;
}

// ============================================================================
// Agent Types
// ============================================================================

/**
 * Agent trigger modes.
 */
export type AgentTrigger = "all" | "user-messages";

/**
 * Unified structure for webhook registration and inline agent invocation.
 */
export interface AgentSpec {
	/** Agent identifier */
	id: string;
	/** Optional display name */
	name?: string;
	/** Endpoint URL the proxy will call */
	endpoint: string;
	/** HTTP method */
	method?: "POST";
	/** Additional headers for agent calls */
	headers?: Record<string, string>;
	/** Trigger mode (for registered agents) */
	triggers?: AgentTrigger;
	/** Request body template */
	bodyTemplate?: Record<string, unknown>;
}

// ============================================================================
// Collection Types
// ============================================================================

// Import types from schema
import type { AgentRow, ChunkRow, PresenceRow } from "./schema";

/**
 * All collections exposed by DurableChatClient.
 *
 * Architecture:
 * - `chunks`, `presence`, `agents`: Synced from Durable Stream via stream-db
 * - `messages`: Root materialized collection (groupBy + collect → materialize)
 * - `toolCalls`, `pendingApprovals`, `toolResults`: Derived from messages via .fn.where()
 * - `activeGenerations`: Derived from messages (incomplete messages)
 * - `sessionMeta`, `sessionStats`: Local/aggregated state
 *
 * The `chunks` and `agents` collections are synced directly from the Durable
 * Stream via stream-db. The `presence` collection is aggregated from raw
 * per-device presence records. Other collections are derived from chunks.
 *
 * Pipeline:
 * ```
 * chunks → (subquery) → messages
 *                          ↓
 *           .fn.where(parts filtering)
 *                          ↓
 *                 toolCalls (lazy)
 *                 pendingApprovals (lazy)
 *                 toolResults (lazy)
 *                 activeGenerations (lazy)
 * ```
 */
export interface DurableChatCollections {
	/** Root chunks collection synced from Durable Stream via stream-db */
	chunks: Collection<ChunkRow>;
	/** Aggregated presence - one row per online actor with their device count */
	presence: Collection<PresenceRow>;
	/** Agents collection - registered webhook agents (from stream-db) */
	agents: Collection<AgentRow>;
	/** All materialized messages (keyed by messageId) */
	messages: Collection<MessageRow>;
	/** Messages containing tool calls (keyed by messageId) */
	toolCalls: Collection<MessageRow>;
	/** Messages with pending approval requests (keyed by messageId) */
	pendingApprovals: Collection<MessageRow>;
	/** Messages containing tool results (keyed by messageId) */
	toolResults: Collection<MessageRow>;
	/** Active generations - incomplete messages (keyed by messageId) */
	activeGenerations: Collection<ActiveGenerationRow>;
	/** Session metadata collection (local state) */
	sessionMeta: Collection<SessionMetaRow>;
	/** Session statistics (keyed by sessionId) */
	sessionStats: Collection<SessionStatsRow>;
}

// ============================================================================
// Client Configuration Types
// ============================================================================

/**
 * Configuration options for DurableChatClient.
 */
export interface DurableChatClientOptions<
	TTools extends ReadonlyArray<AnyClientTool> = AnyClientTool[],
> {
	/** Session identifier */
	sessionId: string;
	/** Proxy URL for API requests */
	proxyUrl: string;
	/** Actor identifier (auto-generated if not provided) */
	actorId?: string;
	/** Actor type */
	actorType?: ActorType;
	/** Client tools */
	tools?: TTools;
	/** Initial messages for SSR hydration */
	initialMessages?: UIMessage[];
	/** API endpoint */
	api?: string;
	/** Additional request body fields */
	body?: Record<string, unknown>;
	/**
	 * Default agent to invoke for each user message.
	 * For single-agent scenarios, this provides a simpler alternative to registerAgents().
	 * The agent spec is sent with each sendMessage request.
	 */
	agent?: AgentSpec;

	// Callbacks (TanStack AI compatible)
	/** Called when response is received */
	onResponse?: (response?: Response) => void | Promise<void>;
	/** Called for each chunk */
	onChunk?: (chunk: StreamChunk) => void;
	/** Called when message finishes */
	onFinish?: (message: UIMessage) => void;
	/** Called on error */
	onError?: (error: Error) => void;
	/** Called when messages change */
	onMessagesChange?: (messages: UIMessage[]) => void;

	/** Durable Streams configuration */
	stream?: {
		/** Additional headers for stream requests */
		headers?: Record<string, string>;
	};

	/**
	 * Pre-created SessionDB for testing.
	 * If provided, the client will use this instead of creating its own via createSessionDB().
	 * This allows tests to inject mock collections with controlled data.
	 * @internal
	 */
	sessionDB?: SessionDB;
}

// ============================================================================
// Tool Result Input Types
// ============================================================================

/**
 * Input for adding a tool result.
 */
export interface ToolResultInput {
	/** Tool call identifier */
	toolCallId: string;
	/** Tool output */
	output: unknown;
	/** Error message if failed */
	error?: string;
	/** Client-generated message ID for optimistic updates (auto-generated if not provided) */
	messageId?: string;
}

/**
 * Tool result input with required messageId (used internally for optimistic actions).
 */
export type ClientToolResultInput = Required<
	Pick<ToolResultInput, "messageId">
> &
	ToolResultInput;

/**
 * Input for adding an approval response.
 */
export interface ApprovalResponseInput {
	/** Approval identifier */
	id: string;
	/** Whether approved */
	approved: boolean;
}

/**
 * Input for submitting an answer to a user question tool call.
 */
export interface AnswerResponseInput {
	/** Tool call identifier */
	toolCallId: string;
	/** User-provided answers keyed by question ID */
	answers: Record<string, string>;
	/** Original tool input for context (forwarded to agent) */
	originalInput?: Record<string, unknown>;
}

// ============================================================================
// Fork Types
// ============================================================================

/**
 * Options for forking a session.
 */
export interface ForkOptions {
	/** Fork before this message (default: current end) */
	atMessageId?: string;
	/** Custom session ID (default: auto-generated) */
	newSessionId?: string;
}

/**
 * Result of forking a session.
 */
export interface ForkResult {
	/** New session identifier */
	sessionId: string;
	/** Starting offset for new session */
	offset: string;
}

// ============================================================================
// Session DB Configuration Types
// ============================================================================

/**
 * Configuration for creating a session stream-db.
 */
export interface SessionDBConfig {
	/** Session identifier */
	sessionId: string;
	/** Base URL for the proxy */
	baseUrl: string;
	/** Additional headers for stream requests */
	headers?: Record<string, string>;
	/**
	 * AbortSignal to cancel the stream sync.
	 * When aborted, the sync will stop and cleanup will be called.
	 */
	signal?: AbortSignal;
	// /**
	//  * Live mode for the stream connection.
	//  * Defaults to "sse" for efficient real-time updates.
	//  */
	// liveMode?: LiveMode
}
