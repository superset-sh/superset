/**
 * React-specific types for @superset/durable-session/react
 */

import type { AnyClientTool, UIMessage } from "@tanstack/ai";
import type {
	AgentSpec,
	AnswerResponseInput,
	ApprovalResponseInput,
	ConnectionStatus,
	DurableChatClient,
	DurableChatClientOptions,
	DurableChatCollections,
	ForkOptions,
	ForkResult,
	ToolResultInput,
} from "..";

/**
 * Options for the useDurableChat hook.
 */
export interface UseDurableChatOptions<
	TTools extends ReadonlyArray<AnyClientTool> = AnyClientTool[],
> extends Partial<DurableChatClientOptions<TTools>> {
	/**
	 * Whether to automatically connect on mount.
	 * @default true
	 */
	autoConnect?: boolean;

	/**
	 * Pre-created client instance.
	 * If provided, the hook will use this client instead of creating a new one.
	 * Useful for testing or when you need to share a client between components.
	 */
	client?: DurableChatClient<TTools>;
}

/**
 * Return value from useDurableChat hook.
 */
export interface UseDurableChatReturn<
	TTools extends ReadonlyArray<AnyClientTool> = AnyClientTool[],
> {
	// ═══════════════════════════════════════════════════════════════════════
	// TanStack AI useChat compatible
	// ═══════════════════════════════════════════════════════════════════════

	/** All messages in the conversation */
	messages: UIMessage[];

	/** Send a user message */
	sendMessage: (content: string) => Promise<void>;

	/** Append a message to the conversation */
	append: (
		message: UIMessage | { role: string; content: string },
	) => Promise<void>;

	/** Stop all active generations */
	stop: () => void;

	/** Clear all messages (local only) */
	clear: () => void;

	/** Whether any generation is currently active */
	isLoading: boolean;

	/** Current error, if any */
	error: Error | undefined;

	/** Add a tool result */
	addToolResult: (result: ToolResultInput) => Promise<void>;

	/** Add an approval response */
	addToolApprovalResponse: (response: ApprovalResponseInput) => Promise<void>;

	/** Submit an answer to a user question tool call */
	addToolAnswerResponse: (response: AnswerResponseInput) => Promise<void>;

	// ═══════════════════════════════════════════════════════════════════════
	// Durable extensions
	// ═══════════════════════════════════════════════════════════════════════

	/**
	 * The underlying DurableChatClient instance.
	 * Always available - created synchronously on hook initialization.
	 */
	client: DurableChatClient<TTools>;

	/**
	 * All collections for custom queries.
	 * Always available - use directly with useLiveQuery.
	 * Data syncs when connectionStatus is 'connected'.
	 */
	collections: DurableChatCollections;

	/** Current connection status */
	connectionStatus: ConnectionStatus;

	/** Fork the session at a message boundary */
	fork: (options?: ForkOptions) => Promise<ForkResult>;

	/** Register agents to respond to session messages */
	registerAgents: (agents: AgentSpec[]) => Promise<void>;

	/** Unregister an agent */
	unregisterAgent: (agentId: string) => Promise<void>;

	/** Connect to the stream (if not auto-connected) */
	connect: () => Promise<void>;

	/** Disconnect from the stream */
	disconnect: () => void;

	/** Pause stream sync */
	pause: () => void;

	/** Resume stream sync */
	resume: () => Promise<void>;
}
