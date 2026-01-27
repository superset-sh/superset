/**
 * DurableChatClient - Chat session client adapted from Electric SQL.
 *
 * Follows the same patterns as @electric-sql/durable-session:
 * - Synchronous construction (collections available immediately)
 * - Async connection via connect()
 * - Proper dispose lifecycle
 *
 * Simplified for our schema: chunks, presence, drafts (no agents, tool calls, etc.)
 */

import { createStreamDB, type StreamDB } from "@durable-streams/state";
import type { Collection } from "@tanstack/db";
import type { SessionUser } from "./actions";
import {
	type SessionStateSchema,
	type StreamChunk,
	type StreamDraft,
	type StreamPresence,
	sessionStateSchema,
} from "./schema";

// ============================================================================
// Types
// ============================================================================

export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "error";

export interface DurableChatClientOptions {
	sessionId: string;
	proxyUrl: string;
	actorId?: string;
	user?: SessionUser | null;
	onError?: (error: Error) => void;
}

/**
 * Collections map with correct row types.
 *
 * stream-db injects the primary key field at runtime, so our types
 * include the `id` field for chunks.
 */
export interface SessionCollections {
	chunks: Collection<StreamChunk & { id: string }, string>;
	presence: Collection<StreamPresence, string>;
	drafts: Collection<StreamDraft, string>;
}

// ============================================================================
// DurableChatClient
// ============================================================================

/**
 * DurableChatClient - Adapted from @electric-sql/durable-session.
 *
 * Provides a simple chat interface backed by Durable Streams.
 * All collections are available immediately after construction.
 *
 * @example
 * ```typescript
 * const client = new DurableChatClient({
 *   sessionId: 'my-session',
 *   proxyUrl: 'http://localhost:8080',
 * })
 *
 * // Collections available immediately
 * const chunks = client.collections.chunks
 *
 * // Connect to start syncing
 * await client.connect()
 *
 * // Send messages
 * await client.sendMessage('Hello!')
 *
 * // Cleanup
 * client.dispose()
 * ```
 */
export class DurableChatClient {
	readonly sessionId: string;
	readonly actorId: string;

	private readonly options: DurableChatClientOptions;

	// Stream-db instance (created synchronously in constructor)
	private readonly _db: StreamDB<SessionStateSchema>;

	// Collections are always available after construction
	private readonly _collections: SessionCollections;

	private _isConnected = false;
	private _isDisposed = false;
	private _connectionStatus: ConnectionStatus = "disconnected";
	private _error: Error | undefined;

	// AbortController for canceling stream sync
	private readonly _abortController: AbortController;

	// =========================================================================
	// Constructor
	// =========================================================================

	constructor(options: DurableChatClientOptions) {
		this.options = options;
		this.sessionId = options.sessionId;
		this.actorId =
			options.actorId ?? options.user?.userId ?? crypto.randomUUID();

		// Create abort controller before anything else
		this._abortController = new AbortController();

		// Create stream-db synchronously (connection happens on preload)
		this._db = createStreamDB({
			streamOptions: {
				url: `${options.proxyUrl}/streams/${options.sessionId}`,
				signal: this._abortController.signal,
			},
			state: sessionStateSchema,
		});

		// Collections are available immediately
		this._collections = this._db.collections as unknown as SessionCollections;
	}

	// =========================================================================
	// Getters
	// =========================================================================

	/**
	 * Get all collections for direct access.
	 * Collections are available immediately after construction.
	 */
	get collections(): SessionCollections {
		return this._collections;
	}

	/**
	 * Get current connection status.
	 */
	get connectionStatus(): ConnectionStatus {
		return this._connectionStatus;
	}

	/**
	 * Check if the client has been disposed.
	 */
	get isDisposed(): boolean {
		return this._isDisposed;
	}

	/**
	 * Get the current error, if any.
	 */
	get error(): Error | undefined {
		return this._error;
	}

	// =========================================================================
	// Lifecycle
	// =========================================================================

	/**
	 * Connect to the durable stream and start syncing.
	 *
	 * This method handles network operations only - collections are already
	 * created synchronously in the constructor and are immediately available.
	 */
	async connect(): Promise<void> {
		if (this._isConnected) return;
		if (this._isDisposed) {
			throw new Error("Cannot connect disposed client");
		}

		try {
			this._connectionStatus = "connecting";

			// Preload stream data
			await this._db.preload();

			this._isConnected = true;
			this._connectionStatus = "connected";

			// Announce presence if we have a user
			if (this.options.user) {
				await this._announcePresence();
			}
		} catch (error) {
			this._error = error instanceof Error ? error : new Error(String(error));
			this._connectionStatus = "error";
			this.options.onError?.(this._error);
			throw error;
		}
	}

	/**
	 * Disconnect from the stream.
	 */
	disconnect(): void {
		// Remove presence before disconnecting
		if (this.options.user && this._isConnected) {
			this._removePresence().catch(() => {});
		}

		this._db.close();
		this._abortController.abort();
		this._isConnected = false;
		this._connectionStatus = "disconnected";
	}

	/**
	 * Dispose the client and clean up resources.
	 *
	 * Note: We only disconnect here - we don't manually cleanup collections.
	 * TanStack DB will GC collections automatically when they have no subscribers.
	 */
	dispose(): void {
		if (this._isDisposed) return;
		this._isDisposed = true;
		this.disconnect();
	}

	// =========================================================================
	// Actions
	// =========================================================================

	/**
	 * Send a user message.
	 */
	async sendMessage(content: string): Promise<void> {
		if (!this._isConnected) {
			throw new Error("Client not connected. Call connect() first.");
		}

		const user = this.options.user;
		if (!user) {
			throw new Error("Cannot send message without user");
		}

		const messageId = crypto.randomUUID();
		const now = new Date().toISOString();

		// Wrap content in WholeMessageChunk format for materialize.ts
		const chunkContent = JSON.stringify({
			type: "whole-message",
			content,
		});

		await this._appendToStream([
			{
				type: "chunk",
				key: `${messageId}:0`,
				value: {
					messageId,
					actorId: user.userId,
					role: "user",
					chunk: chunkContent,
					seq: 0,
					createdAt: now,
				},
				headers: { operation: "insert" },
			},
		]);
	}

	/**
	 * Update the user's draft.
	 */
	async updateDraft(content: string): Promise<void> {
		const user = this.options.user;
		if (!user) return;

		const now = new Date().toISOString();

		await this._appendToStream([
			{
				type: "draft",
				key: user.userId,
				value: {
					userId: user.userId,
					userName: user.name,
					content,
					updatedAt: now,
				},
				headers: { operation: content ? "upsert" : "delete" },
			},
		]);
	}

	/**
	 * Update the user associated with this client.
	 * Useful for late binding when user auth completes after client creation.
	 */
	setUser(user: SessionUser | null): void {
		const previousUser = this.options.user;
		(this.options as { user: SessionUser | null }).user = user;

		// If connected, update presence
		if (this._isConnected) {
			if (previousUser && !user) {
				// User logged out - remove presence
				this._removePresence().catch(this.options.onError ?? console.error);
			} else if (user && !previousUser) {
				// User logged in - announce presence
				this._announcePresence().catch(this.options.onError ?? console.error);
			} else if (user && previousUser && user.userId !== previousUser.userId) {
				// User changed - update presence
				this._removePresence()
					.then(() => this._announcePresence())
					.catch(this.options.onError ?? console.error);
			}
		}
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	private async _announcePresence(): Promise<void> {
		const user = this.options.user;
		if (!user) return;

		await this._appendToStream([
			{
				type: "presence",
				key: user.userId,
				value: {
					userId: user.userId,
					userName: user.name,
					joinedAt: new Date().toISOString(),
				},
				headers: { operation: "upsert" },
			},
		]);
	}

	private async _removePresence(): Promise<void> {
		const user = this.options.user;
		if (!user) return;

		await this._appendToStream([
			{
				type: "presence",
				key: user.userId,
				headers: { operation: "delete" },
			},
			{
				type: "draft",
				key: user.userId,
				headers: { operation: "delete" },
			},
		]);
	}

	private async _appendToStream(events: unknown[]): Promise<void> {
		const response = await fetch(
			`${this.options.proxyUrl}/streams/${this.sessionId}`,
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(events),
			},
		);

		if (!response.ok) {
			throw new Error(`Failed to append to stream: ${response.status}`);
		}
	}
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new DurableChatClient instance.
 *
 * @param options - Client options
 * @returns New client instance
 */
export function createDurableChatClient(
	options: DurableChatClientOptions,
): DurableChatClient {
	return new DurableChatClient(options);
}
