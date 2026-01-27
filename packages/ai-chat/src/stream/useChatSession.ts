/**
 * useChatSession - React hook for durable chat.
 *
 * Copied 1:1 from @electric-sql/react-durable-session/use-durable-chat.ts
 * Adapted for our schema: chunks, presence, drafts (no agents, tool calls, etc.)
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
	type ConnectionStatus,
	DurableChatClient,
	type DurableChatClientOptions,
	type SessionCollections,
} from "./client";
import {
	type ChunkRow,
	type MessageRow,
	materializeMessage,
} from "./materialize";
import type { StreamChunk, StreamDraft, StreamPresence } from "./schema";
import { useCollectionData } from "./useCollectionData";

// ============================================================================
// Types
// ============================================================================

export interface UseChatSessionOptions
	extends Omit<DurableChatClientOptions, "onError"> {
	/** Auto-connect when hook mounts. Defaults to true. */
	autoConnect?: boolean;
	/** Provide an existing client instead of creating one */
	client?: DurableChatClient;
	/** Error handler */
	onError?: (error: Error) => void;
}

export interface ChatUser {
	userId: string;
	name: string;
}

export interface UseChatSessionReturn {
	// Data
	messages: MessageRow[];
	streamingMessage: MessageRow | null;
	users: ChatUser[];
	draft: string;
	drafts: StreamDraft[];

	// Actions
	sendMessage: (content: string) => Promise<void>;
	setDraft: (content: string) => void; // Sync for onChange compatibility

	// State
	isLoading: boolean;
	error: Error | undefined;
	connectionStatus: ConnectionStatus;

	// Extensions
	client: DurableChatClient;
	collections: SessionCollections;
	connect: () => Promise<void>;
	disconnect: () => void;
}

// ============================================================================
// Hook Implementation
// ============================================================================

/**
 * React hook for durable chat with TanStack AI-compatible API.
 *
 * Provides reactive data binding with automatic updates when underlying
 * collection data changes. Supports SSR through proper `useSyncExternalStore`
 * integration.
 *
 * The client and collections are always available synchronously.
 * Connection state is managed separately via `connectionStatus`.
 *
 * @example Basic usage
 * ```typescript
 * function Chat() {
 *   const { messages, sendMessage, isLoading, collections } = useChatSession({
 *     sessionId: 'my-session',
 *     proxyUrl: 'http://localhost:8080',
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
 */
export function useChatSession(
	options: UseChatSessionOptions,
): UseChatSessionReturn {
	const {
		autoConnect = true,
		client: providedClient,
		onError: userOnError,
		...clientOptions
	} = options;

	// Error handler ref - allows client's onError to call setError
	const [error, setError] = useState<Error | undefined>();
	const onErrorRef = useRef<(err: Error) => void>(() => {});
	onErrorRef.current = (err) => {
		setError(err);
		userOnError?.(err);
	};

	// Create client synchronously - always available immediately
	const clientRef = useRef<{
		client: DurableChatClient;
		key: string;
	} | null>(null);
	const key = `${clientOptions.sessionId}:${clientOptions.proxyUrl}`;

	// Create or recreate client when key changes or client was disposed
	// The isDisposed check handles React Strict Mode: cleanup disposes the client,
	// so the next render must create a fresh one with a new AbortController.
	if (providedClient) {
		if (!clientRef.current || clientRef.current.client !== providedClient) {
			clientRef.current = { client: providedClient, key: "provided" };
		}
	} else if (
		!clientRef.current ||
		clientRef.current.key !== key ||
		clientRef.current.client.isDisposed
	) {
		// Dispose old client if exists (may already be disposed, which is fine)
		clientRef.current?.client.dispose();
		clientRef.current = {
			client: new DurableChatClient({
				...clientOptions,
				onError: (err) => onErrorRef.current(err),
			}),
			key,
		};
	}

	const client = clientRef.current.client;

	// =========================================================================
	// Collection Subscriptions (1:1 from Electric SQL)
	// =========================================================================

	const chunkRows = useCollectionData(client.collections.chunks);
	const presenceRows = useCollectionData(client.collections.presence);
	const draftRows = useCollectionData(client.collections.drafts);

	// =========================================================================
	// Derived State
	// =========================================================================

	// Materialize messages from chunks
	const { messages, streamingMessage } = useMemo(() => {
		if (chunkRows.length === 0) {
			return { messages: [], streamingMessage: null };
		}

		// Group chunks by messageId
		const byMessage = new Map<string, ChunkRow[]>();
		for (const rawChunk of chunkRows) {
			const chunk = rawChunk as StreamChunk & { id: string };
			const chunkRow: ChunkRow = {
				messageId: chunk.messageId,
				actorId: chunk.actorId,
				role: chunk.role,
				chunk: chunk.chunk,
				seq: chunk.seq,
				createdAt: chunk.createdAt,
				id: chunk.id,
			};
			const existing = byMessage.get(chunk.messageId) ?? [];
			existing.push(chunkRow);
			byMessage.set(chunk.messageId, existing);
		}

		// Materialize each message group and sort by first chunk's createdAt
		const all = Array.from(byMessage.values())
			.map((rows) => materializeMessage(rows))
			.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

		// Separate complete messages from streaming (incomplete) message
		const complete = all.filter((m) => m.isComplete);
		const streaming = all.find((m) => !m.isComplete) ?? null;

		return { messages: complete, streamingMessage: streaming };
	}, [chunkRows]);

	// Transform presence to ChatUser[]
	const users = useMemo(
		(): ChatUser[] =>
			presenceRows.map((p: StreamPresence) => ({
				userId: p.userId,
				name: p.userName,
			})),
		[presenceRows],
	);

	// All drafts
	const drafts = useMemo((): StreamDraft[] => draftRows, [draftRows]);

	// Current user's draft
	const draft = useMemo((): string => {
		const user = clientOptions.user;
		if (!user) return "";
		const myDraft = draftRows.find(
			(d: StreamDraft) => d.userId === user.userId,
		);
		return myDraft?.content ?? "";
	}, [draftRows, clientOptions.user]);

	// Connection status (we don't have sessionMeta collection, use client directly)
	const connectionStatus = client.connectionStatus;
	const isLoading = connectionStatus !== "connected";

	// =========================================================================
	// Connection Lifecycle (1:1 from Electric SQL)
	// =========================================================================

	useEffect(() => {
		if (autoConnect && client.connectionStatus === "disconnected") {
			client.connect().catch((err) => {
				setError(err instanceof Error ? err : new Error(String(err)));
			});
		}

		// Cleanup: unsubscribe and dispose (disposal is idempotent)
		return () => {
			if (!providedClient) {
				client.dispose();
			}
		};
	}, [client, autoConnect, providedClient]);

	// =========================================================================
	// Action Callbacks (1:1 from Electric SQL)
	// =========================================================================

	const sendMessage = useCallback(
		async (content: string) => {
			try {
				await client.sendMessage(content);
			} catch (err) {
				setError(err instanceof Error ? err : new Error(String(err)));
				throw err;
			}
		},
		[client],
	);

	// setDraft is sync (fire-and-forget) for onChange compatibility
	const setDraft = useCallback(
		(content: string) => {
			client.updateDraft(content).catch((err) => {
				setError(err instanceof Error ? err : new Error(String(err)));
			});
		},
		[client],
	);

	const connect = useCallback(async () => {
		try {
			await client.connect();
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
			throw err;
		}
	}, [client]);

	const disconnect = useCallback(() => {
		client.disconnect();
	}, [client]);

	// =========================================================================
	// Return (1:1 structure from Electric SQL)
	// =========================================================================

	return {
		// Data
		messages,
		streamingMessage,
		users,
		draft,
		drafts,

		// Actions
		sendMessage,
		setDraft,

		// State
		isLoading,
		error,
		connectionStatus,

		// Extensions
		client,
		collections: client.collections,
		connect,
		disconnect,
	};
}
