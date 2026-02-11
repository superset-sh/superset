/**
 * @superset/durable-session/react
 *
 * React bindings for durable chat client backed by TanStack DB and Durable Streams.
 *
 * This package provides React hooks for building durable chat applications with:
 * - TanStack AI-compatible API (drop-in replacement for useChat)
 * - Automatic React state management
 * - Access to reactive collections for custom queries
 * - Multi-agent support
 *
 * @example
 * ```typescript
 * import { useDurableChat } from '@superset/durable-session/react'
 *
 * function Chat() {
 *   const { messages, sendMessage, isLoading } = useDurableChat({
 *     sessionId: 'my-session',
 *     proxyUrl: 'http://localhost:4000',
 *   })
 *
 *   return (
 *     <div>
 *       {messages.map(m => <Message key={m.id} message={m} />)}
 *       <Input onSubmit={sendMessage} disabled={isLoading} />
 *     </div>
 *   )
 * }
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Hooks
// ============================================================================

export { useDurableChat } from "./use-durable-chat";

// ============================================================================
// Components
// ============================================================================

export { ChatInput, type ChatInputProps } from "./components/ChatInput";
export {
	PresenceBar,
	type PresenceBarProps,
	type PresenceUser,
} from "./components/PresenceBar";

// ============================================================================
// Types
// ============================================================================

export type { UseDurableChatOptions, UseDurableChatReturn } from "./types";

// ============================================================================
// Re-exports from durable-session
// ============================================================================

export {
	type ActiveGenerationRow,
	// Types
	type ActorType,
	type AgentRow,
	type AgentSpec,
	type AgentTrigger,
	type ApprovalResponseInput,
	type ChunkRow,
	type ConnectionStatus,
	createDurableChatClient,
	// Client
	DurableChatClient,
	type DurableChatClientOptions,
	type DurableChatCollections,
	// Materialization helpers
	extractTextContent,
	type ForkOptions,
	type ForkResult,
	isAssistantMessage,
	isUserMessage,
	// Re-exported TanStack AI types for consumer convenience
	type MessagePart,
	type MessageRole,
	type MessageRow,
	type PresenceRow,
	type RawPresenceRow,
	type SessionMetaRow,
	type SessionStatsRow,
	type TextPart,
	type ThinkingPart,
	type ToolCallPart,
	type ToolResultInput,
	type ToolResultPart,
	type UIMessage,
} from "..";
