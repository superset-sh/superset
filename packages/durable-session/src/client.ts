/**
 * DurableChatClient - Framework-agnostic durable chat client.
 *
 * Provides TanStack AI-compatible API backed by Durable Streams
 * with real-time sync and multi-agent support.
 *
 * All derived collections contain fully materialized MessageRow objects.
 * Consumers filter message.parts to access specific part types (ToolCallPart, etc.).
 */

import type { AnyClientTool, ToolCallPart, UIMessage } from "@tanstack/ai";
import type { Transaction } from "@tanstack/db";
import { createCollection, createOptimisticAction } from "@tanstack/db";
import { createSessionDB, type SessionDB } from "./collection";
import {
	createActiveGenerationsCollection,
	createInitialSessionMeta,
	createMessagesCollection,
	createPendingApprovalsCollection,
	createPresenceCollection,
	createSessionMetaCollectionOptions,
	createSessionStatsCollection,
	createToolCallsCollection,
	createToolResultsCollection,
	updateConnectionStatus,
} from "./collections";
import { StreamError } from "./errors";
import { extractTextContent, messageRowToUIMessage } from "./materialize";
import type {
	ActorType,
	AgentSpec,
	AnswerResponseInput,
	ApprovalResponseInput,
	ClientToolResultInput,
	ConnectionStatus,
	DurableChatClientOptions,
	ForkOptions,
	ForkResult,
	MessageRow,
	SessionMetaRow,
	ToolResultInput,
} from "./types";

/**
 * Unified input for all message optimistic actions.
 */
interface MessageActionInput {
	/** Message content */
	content: string;
	/** Client-generated message ID */
	messageId: string;
	/** Message role */
	role: "user" | "assistant" | "system";
	/** Optional agent to invoke (for user messages) */
	agent?: AgentSpec;
}

/**
 * DurableChatClient provides a TanStack AI-compatible chat interface
 * backed by Durable Streams for persistence and real-time sync.
 *
 * All derived collections contain fully materialized objects.
 * Access data directly from collections - no helper functions needed.
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
 * // Use TanStack AI-compatible API
 * await client.sendMessage('Hello!')
 * console.log(client.messages)
 *
 * // Or use collections directly
 * for (const message of client.collections.messages.values()) {
 *   console.log(message.id, message.role, message.parts)
 * }
 *
 * // Filter tool calls
 * const pending = [...client.collections.toolCalls.values()]
 *   .filter(tc => tc.state === 'pending')
 * ```
 */

export class DurableChatClient<
	TTools extends ReadonlyArray<AnyClientTool> = AnyClientTool[],
> {
	readonly sessionId: string;
	readonly actorId: string;
	readonly actorType: ActorType;

	private readonly options: DurableChatClientOptions<TTools>;

	// Stream-db instance (created synchronously in constructor)
	// Either from options.sessionDB (tests) or createSessionDB() (production)
	private readonly _db: SessionDB;

	// Collections are typed via inference from createCollections()
	// Created synchronously in constructor - always available
	private readonly _collections: ReturnType<
		DurableChatClient["createCollections"]
	>;

	private _isConnected = false;
	private _isDisposed = false;
	private _error: Error | undefined;

	// AbortController created at construction time to pass signal to stream-db.
	// Aborted on disconnect() to cancel the stream sync.
	private readonly _abortController: AbortController;

	// Optimistic actions for mutations (created synchronously in constructor)
	private readonly _messageAction: (input: MessageActionInput) => Transaction;
	private readonly _addToolResultAction: (
		input: ClientToolResultInput,
	) => Transaction;
	private readonly _addApprovalResponseAction: (
		input: ApprovalResponseInput,
	) => Transaction;
	private readonly _addAnswerResponseAction: (
		input: AnswerResponseInput,
	) => Transaction;

	// ═══════════════════════════════════════════════════════════════════════
	// Constructor
	// ═══════════════════════════════════════════════════════════════════════

	constructor(options: DurableChatClientOptions<TTools>) {
		this.options = {
			...options,
			proxyUrl: options.proxyUrl.replace(/\/+$/, ""),
		};
		this.sessionId = options.sessionId;
		this.actorId = options.actorId ?? crypto.randomUUID();
		this.actorType = options.actorType ?? "user";

		this._abortController = new AbortController();

		this._db =
			options.sessionDB ??
			createSessionDB({
				sessionId: this.sessionId,
				baseUrl: options.proxyUrl,
				headers: options.stream?.headers,
				signal: this._abortController.signal,
			});

		this._collections = this.createCollections();

		this._collections.sessionMeta.insert(
			createInitialSessionMeta(this.sessionId),
		);

		this._messageAction = this.createMessageAction();
		this._addToolResultAction = this.createAddToolResultAction();
		this._addApprovalResponseAction = this.createApprovalResponseAction();
		this._addAnswerResponseAction = this.createAnswerResponseAction();
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Collection Setup
	// ═══════════════════════════════════════════════════════════════════════

	/**
	 * Create all derived collections from the chunks collection.
	 *
	 * Pipeline architecture:
	 * - chunks → (subquery) → messages (root materialized collection)
	 * - Derived collections filter messages via .fn.where() on parts
	 *
	 * CRITICAL: Materialization happens inside fn.select(). No imperative code
	 * outside this pattern.
	 */
	private createCollections() {
		const { chunks, presence: rawPresence, agents } = this._db.collections;

		// chunks → messages (inline subquery for chunk aggregation)
		const messages = createMessagesCollection({
			chunksCollection: chunks,
		});

		// Derived collections filter on message parts
		const toolCalls = createToolCallsCollection({
			messagesCollection: messages,
		});

		const pendingApprovals = createPendingApprovalsCollection({
			messagesCollection: messages,
		});

		const toolResults = createToolResultsCollection({
			messagesCollection: messages,
		});

		const activeGenerations = createActiveGenerationsCollection({
			messagesCollection: messages,
		});

		const sessionMeta = createCollection(
			createSessionMetaCollectionOptions({
				sessionId: this.sessionId,
			}),
		);

		const sessionStats = createSessionStatsCollection({
			sessionId: this.sessionId,
			chunksCollection: chunks,
		});

		// Aggregated "who's online" view (groups rawPresence by actorId)
		const presence = createPresenceCollection({
			sessionId: this.sessionId,
			rawPresenceCollection: rawPresence,
		});

		return {
			chunks,
			presence,
			agents,
			messages,
			toolCalls,
			pendingApprovals,
			toolResults,
			activeGenerations,
			sessionMeta,
			sessionStats,
		};
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Core API (TanStack AI ChatClient compatible)
	// ═══════════════════════════════════════════════════════════════════════

	get messages(): UIMessage[] {
		return [...this._collections.messages.values()].map(messageRowToUIMessage);
	}

	get isLoading(): boolean {
		return this._collections.activeGenerations.size > 0;
	}

	get error(): Error | undefined {
		return this._error;
	}

	get isDisposed(): boolean {
		return this._isDisposed;
	}

	/**
	 * Send a user message and trigger agent response.
	 *
	 * Uses optimistic updates for instant UI feedback. The message appears
	 * immediately in the UI while the server request is in flight.
	 *
	 * @param content - Text content to send
	 */
	async sendMessage(content: string): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Client not connected. Call connect() first.");
		}

		await this.executeAction(this._messageAction, {
			content,
			messageId: crypto.randomUUID(),
			role: "user",
			agent: this.options.agent,
		});
	}

	/**
	 * Append a message to the conversation.
	 *
	 * Uses optimistic updates for instant UI feedback.
	 * For user messages, this triggers agent response if an agent is configured.
	 *
	 * @param message - UIMessage or ModelMessage to append
	 */
	async append(
		message: UIMessage | { role: string; content: string },
	): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Client not connected. Call connect() first.");
		}

		const content =
			"parts" in message
				? extractTextContent(message as MessageRow)
				: (message as { content: string }).content;

		const role = message.role as "user" | "assistant" | "system";
		const messageId = "id" in message ? message.id : crypto.randomUUID();

		await this.executeAction(this._messageAction, {
			content,
			messageId,
			role,
			agent: role === "user" ? this.options.agent : undefined,
		});
	}

	private async executeAction<T>(
		action: (input: T) => Transaction,
		input: T,
	): Promise<void> {
		try {
			const transaction = action(input);
			await transaction.isPersisted.promise;
		} catch (error) {
			this._error = error instanceof Error ? error : new Error(String(error));
			this.options.onError?.(this._error);
			throw error;
		}
	}

	private async postToProxy(
		path: string,
		body: Record<string, unknown>,
		options?: { actorIdHeader?: boolean },
	): Promise<void> {
		const headers: Record<string, string> = {
			...this.options.stream?.headers,
			"Content-Type": "application/json",
		};
		if (options?.actorIdHeader) {
			headers["X-Actor-Id"] = this.actorId;
		}

		const response = await fetch(`${this.options.proxyUrl}${path}`, {
			method: "POST",
			headers,
			body: JSON.stringify(body),
		});

		if (!response.ok) {
			throw StreamError.fromResponse(response);
		}
	}

	/**
	 * Create the unified optimistic action for all message types.
	 * Handles user, assistant, and system messages with the same pattern.
	 *
	 * Optimistic updates insert into the messages collection directly.
	 * This ensures the optimistic state propagates to all derived collections
	 * (toolCalls, pendingApprovals, toolResults, activeGenerations).
	 */
	private createMessageAction() {
		return createOptimisticAction<MessageActionInput>({
			onMutate: ({ content, messageId, role }) => {
				const createdAt = new Date();

				this._collections.messages.insert({
					id: messageId,
					role,
					parts: [{ type: "text" as const, content }],
					actorId: this.actorId,
					isComplete: true,
					createdAt,
				});
			},
			mutationFn: async ({ content, messageId, role, agent }) => {
				const txid = crypto.randomUUID();

				await this.postToProxy(`/v1/sessions/${this.sessionId}/messages`, {
					messageId,
					content,
					role,
					actorId: this.actorId,
					actorType: this.actorType,
					txid,
					...(agent && { agent }),
				});

				// Wait for txid to appear in synced stream
				await this._db.utils.awaitTxId(txid);
			},
		});
	}

	async stop(): Promise<void> {
		await this.postToProxy(`/v1/sessions/${this.sessionId}/stop`, {
			messageId: null,
		});
	}

	clear(): void {
		this.options.onMessagesChange?.([]);
	}

	/**
	 * Add a tool result.
	 *
	 * Uses optimistic updates for instant UI feedback.
	 *
	 * @param result - Tool result to add
	 */
	async addToolResult(result: ToolResultInput): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Client not connected. Call connect() first.");
		}

		const inputWithMessageId: ClientToolResultInput = {
			...result,
			messageId: result.messageId ?? crypto.randomUUID(),
		};
		await this.executeAction(this._addToolResultAction, inputWithMessageId);
	}

	private createAddToolResultAction() {
		return createOptimisticAction<ClientToolResultInput>({
			onMutate: ({ messageId, toolCallId, output, error }) => {
				const createdAt = new Date();

				this._collections.messages.insert({
					id: messageId,
					role: "assistant",
					parts: [
						{
							type: "tool-result" as const,
							toolCallId,
							content:
								typeof output === "string" ? output : JSON.stringify(output),
							state: error ? ("error" as const) : ("complete" as const),
							...(error && { error }),
						},
					],
					actorId: this.actorId,
					isComplete: true,
					createdAt,
				});
			},
			mutationFn: async ({ messageId, toolCallId, output, error }) => {
				const txid = crypto.randomUUID();

				await this.postToProxy(
					`/v1/sessions/${this.sessionId}/tool-results`,
					{ messageId, toolCallId, output, error: error ?? null, txid },
					{ actorIdHeader: true },
				);

				// Wait for txid to appear in synced stream
				await this._db.utils.awaitTxId(txid);
			},
		});
	}

	/**
	 * Add an approval response.
	 *
	 * Uses optimistic updates for instant UI feedback.
	 *
	 * @param response - Approval response
	 */
	async addToolApprovalResponse(
		response: ApprovalResponseInput,
	): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Client not connected. Call connect() first.");
		}

		await this.executeAction(this._addApprovalResponseAction, response);
	}

	/**
	 * Create the optimistic action for approval responses.
	 *
	 * Finds the message containing the tool call with the approval and updates
	 * the approval.approved field. This propagates to pendingApprovals collection.
	 */
	private createApprovalResponseAction() {
		return createOptimisticAction<ApprovalResponseInput>({
			onMutate: ({ id, approved }) => {
				for (const message of this._collections.messages.values()) {
					for (const part of message.parts) {
						if (part.type === "tool-call" && part.approval?.id === id) {
							this._collections.messages.update(message.id, (draft) => {
								for (const p of draft.parts) {
									const toolCall = p as ToolCallPart;
									if (
										p.type === "tool-call" &&
										toolCall.approval?.id === id &&
										toolCall.approval
									) {
										toolCall.approval.approved = approved;
									}
								}
							});
							return;
						}
					}
				}
			},
			mutationFn: async ({ id, approved }) => {
				const txid = crypto.randomUUID();

				await this.postToProxy(
					`/v1/sessions/${this.sessionId}/approvals/${id}`,
					{ approved, txid },
					{ actorIdHeader: true },
				);

				// Wait for txid to appear in synced stream
				await this._db.utils.awaitTxId(txid);
			},
		});
	}

	/**
	 * Submit an answer to a user question tool call.
	 *
	 * Forwards the answer to the agent via the proxy. Unlike approvals,
	 * answers don't modify local state — they trigger agent continuation.
	 *
	 * @param response - Answer response with tool call ID and answers
	 */
	async addToolAnswerResponse(response: AnswerResponseInput): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Client not connected. Call connect() first.");
		}

		await this.executeAction(this._addAnswerResponseAction, response);
	}

	/**
	 * Create the optimistic action for answer responses.
	 *
	 * Answers don't modify local message state (unlike approvals).
	 * They are forwarded to the agent which will continue the conversation.
	 */
	private createAnswerResponseAction() {
		return createOptimisticAction<AnswerResponseInput>({
			onMutate: () => {
				// No optimistic update needed — answers trigger agent continuation,
				// they don't modify existing tool call state.
			},
			mutationFn: async ({ toolCallId, answers, originalInput }) => {
				await this.postToProxy(
					`/v1/sessions/${this.sessionId}/answers/${toolCallId}`,
					{ answers, ...(originalInput && { originalInput }) },
					{ actorIdHeader: true },
				);
			},
		});
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Collections
	// ═══════════════════════════════════════════════════════════════════════

	get collections() {
		return this._collections;
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Durable-specific features
	// ═══════════════════════════════════════════════════════════════════════

	get connectionStatus(): ConnectionStatus {
		const meta = this._collections.sessionMeta.get(this.sessionId);
		return meta?.connectionStatus ?? "disconnected";
	}

	/**
	 * Fork session at a message boundary.
	 *
	 * @param options - Fork options
	 * @returns New session info
	 */
	async fork(options?: ForkOptions): Promise<ForkResult> {
		const response = await fetch(
			`${this.options.proxyUrl}/v1/sessions/${this.sessionId}/fork`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					atMessageId: options?.atMessageId ?? null,
					newSessionId: options?.newSessionId ?? null,
				}),
			},
		);

		if (!response.ok) {
			throw StreamError.fromResponse(response);
		}

		return (await response.json()) as ForkResult;
	}

	/**
	 * Register agents to respond to session messages.
	 *
	 * @param agents - Agent specifications
	 */
	async registerAgents(agents: AgentSpec[]): Promise<void> {
		const response = await fetch(
			`${this.options.proxyUrl}/v1/sessions/${this.sessionId}/agents`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ agents }),
			},
		);

		if (!response.ok) {
			throw StreamError.fromResponse(response);
		}
	}

	/**
	 * Unregister an agent.
	 *
	 * @param agentId - Agent identifier
	 */
	async unregisterAgent(agentId: string): Promise<void> {
		const response = await fetch(
			`${this.options.proxyUrl}/v1/sessions/${this.sessionId}/agents/${agentId}`,
			{
				method: "DELETE",
			},
		);

		if (!response.ok) {
			throw StreamError.fromResponse(response);
		}
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Lifecycle
	// ═══════════════════════════════════════════════════════════════════════

	/**
	 * Connect to the durable stream and start syncing.
	 *
	 * This method handles network operations only - collections are already
	 * created synchronously in the constructor and are immediately available.
	 */
	async connect(): Promise<void> {
		if (this._isConnected) return;

		try {
			this.updateSessionMeta((meta) =>
				updateConnectionStatus(meta, "connecting"),
			);

			if (!this.options.sessionDB) {
				const response = await fetch(
					`${this.options.proxyUrl}/v1/sessions/${this.sessionId}`,
					{
						method: "PUT",
						headers: this.options.stream?.headers,
						signal: this._abortController.signal,
					},
				);

				if (!response.ok) {
					throw StreamError.fromResponse(response);
				}
			}

			await this._db.preload();

			this._isConnected = true;

			this.updateSessionMeta((meta) =>
				updateConnectionStatus(meta, "connected"),
			);
		} catch (error) {
			const err = error instanceof Error ? error : new Error(String(error));
			this._error = err;
			this.updateSessionMeta((meta) =>
				updateConnectionStatus(meta, "error", {
					message: err.message,
				}),
			);
			this.options.onError?.(this._error);
			throw error;
		}
	}

	pause(): void {
		// No-op: stream-db handles pausing internally via the abort signal
	}

	async resume(): Promise<void> {
		if (!this._isConnected) {
			await this.connect();
			return;
		}
		// No-op: stream-db handles resuming internally
	}

	disconnect(): void {
		this._db.close();

		this._abortController.abort();
		this._isConnected = false;

		this.updateSessionMeta((meta) =>
			updateConnectionStatus(meta, "disconnected"),
		);
	}

	/**
	 * Dispose the client and clean up resources.
	 *
	 * Note: We only disconnect here - we don't manually cleanup collections.
	 * All exposed collections could be used by application code via useLiveQuery,
	 * and manual cleanup would error: "Source collection was manually cleaned up
	 * while live query depends on it."
	 *
	 * TanStack DB will GC collections automatically when they have no subscribers.
	 */
	dispose(): void {
		if (this._isDisposed) return;
		this._isDisposed = true;
		this.disconnect();
	}

	// ═══════════════════════════════════════════════════════════════════════
	// Private Helpers
	// ═══════════════════════════════════════════════════════════════════════

	private updateSessionMeta(
		updater: (meta: SessionMetaRow) => SessionMetaRow,
	): void {
		const current = this._collections.sessionMeta.get(this.sessionId);
		if (current) {
			const updated = updater(current);
			this._collections.sessionMeta.update(this.sessionId, (draft) => {
				Object.assign(draft, updated);
			});
		}
	}
}

// ═══════════════════════════════════════════════════════════════════════════
// Factory Function
// ═══════════════════════════════════════════════════════════════════════════

export function createDurableChatClient<
	TTools extends ReadonlyArray<AnyClientTool> = AnyClientTool[],
>(options: DurableChatClientOptions<TTools>): DurableChatClient<TTools> {
	return new DurableChatClient(options);
}
