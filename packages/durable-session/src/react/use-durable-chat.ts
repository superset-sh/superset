/**
 * useDurableChat - React hook for durable chat.
 *
 * Provides TanStack AI-compatible API backed by Durable Streams
 */

import type { AnyClientTool, UIMessage } from "@tanstack/ai";
import type { Collection } from "@tanstack/react-db";
import {
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import type { DurableChatClientOptions } from "..";
import { DurableChatClient, messageRowToUIMessage } from "..";
import type { UseDurableChatOptions, UseDurableChatReturn } from "./types";

/**
 * Extract the item type from a Collection.
 *
 * TanStack DB's Collection has 5 type parameters:
 * `Collection<T, TKey, TUtils, TSchema, TInsertInput>`
 *
 * This helper extracts `T` (the item type) from any Collection variant.
 */
type CollectionItem<C> =
	// biome-ignore lint/suspicious/noExplicitAny: Collection generic params require any for conditional type inference
	C extends Collection<infer T, any, any, any, any> ? T : never;

/**
 * SSR-safe hook for subscribing to TanStack DB collection data.
 * This is a workaround to useLiveQuery not yet supporting SSR
 * as per https://github.com/TanStack/db/pull/709
 */
// biome-ignore lint/suspicious/noExplicitAny: Collection generic params require any for type constraint
function useCollectionData<C extends Collection<any, any, any, any, any>>(
	collection: C,
): CollectionItem<C>[] {
	type T = CollectionItem<C>;

	// Track version to know when to create a new snapshot.
	// Incremented by subscription callback when collection changes.
	const versionRef = useRef(0);

	// Cache the last snapshot to maintain stable reference.
	// useSyncExternalStore requires getSnapshot to return the same reference
	// when data hasn't changed, otherwise it triggers infinite re-renders.
	const snapshotRef = useRef<{ version: number; data: T[] }>({
		version: -1, // Force initial snapshot creation
		data: [],
	});

	// Subscribe callback - increments version to signal data changed.
	// Stored in ref to maintain stable reference for useSyncExternalStore.
	const subscribeRef = useRef((onStoreChange: () => void): (() => void) => {
		const subscription = collection.subscribeChanges(() => {
			versionRef.current++;
			onStoreChange();
		});
		return () => subscription.unsubscribe();
	});

	subscribeRef.current = (onStoreChange: () => void): (() => void) => {
		const subscription = collection.subscribeChanges(() => {
			versionRef.current++;
			onStoreChange();
		});
		return () => subscription.unsubscribe();
	};

	// Returns cached data unless version changed.
	// Stored in ref to maintain stable reference for useSyncExternalStore.
	const getSnapshotRef = useRef((): T[] => {
		const currentVersion = versionRef.current;
		const cached = snapshotRef.current;

		if (cached.version === currentVersion) {
			return cached.data;
		}

		const data = [...collection.values()] as T[];
		snapshotRef.current = { version: currentVersion, data };
		return data;
	});

	getSnapshotRef.current = (): T[] => {
		const currentVersion = versionRef.current;
		const cached = snapshotRef.current;

		if (cached.version === currentVersion) {
			return cached.data;
		}

		const data = [...collection.values()] as T[];
		snapshotRef.current = { version: currentVersion, data };
		return data;
	};

	// Pass the same function for both getSnapshot and getServerSnapshot.
	// This ensures server and client render the same initial state (empty array),
	// preventing hydration mismatches while enabling proper SSR.
	return useSyncExternalStore(
		subscribeRef.current,
		getSnapshotRef.current,
		getSnapshotRef.current,
	);
}

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
 *   const { messages, sendMessage, isLoading, collections } = useDurableChat({
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
 * @example Custom queries with useLiveQuery
 * ```typescript
 * import { useLiveQuery, eq } from '@tanstack/react-db'
 *
 * function Chat() {
 *   const { collections } = useDurableChat({ ... })
 *
 *   // Use collections with useLiveQuery for custom queries
 *   const pendingToolCalls = useLiveQuery(q =>
 *     q.from({ tc: collections.toolCalls })
 *      .where(({ tc }) => eq(tc.state, 'pending'))
 *   )
 * }
 * ```
 */
export function useDurableChat<
	TTools extends ReadonlyArray<AnyClientTool> = AnyClientTool[],
>(options: UseDurableChatOptions<TTools>): UseDurableChatReturn<TTools> {
	const {
		autoConnect = true,
		client: providedClient,
		...clientOptions
	} = options;

	// Error handler ref - allows client's onError to call setError
	const [error, setError] = useState<Error | undefined>();
	const onErrorRef = useRef<(err: Error) => void>(() => {});
	onErrorRef.current = (err) => {
		setError(err);
		clientOptions.onError?.(err);
	};

	// Create client synchronously - always available immediately
	const clientRef = useRef<{
		client: DurableChatClient<TTools>;
		key: string;
	} | null>(null);
	const authHeader = clientOptions.stream?.headers?.Authorization;
	const key = `${clientOptions.sessionId}:${clientOptions.proxyUrl}:${authHeader ?? ""}`;

	// Create or recreate client when key changes or client was disposed.
	// The isDisposed check handles React Strict Mode: cleanup disposes the client,
	// so the next render must create a fresh one with a new AbortController.
	if (providedClient) {
		if (!clientRef.current || clientRef.current.client !== providedClient) {
			const prev = clientRef.current?.client;
			if (prev && !prev.isDisposed) {
				// Defer disposal via microtask — dispose() triggers collection events
				// which call setState, so it must not run during render or useEffect.
				queueMicrotask(() => prev.dispose());
			}
			clientRef.current = { client: providedClient, key: "provided" };
		}
	} else if (
		!clientRef.current ||
		clientRef.current.key !== key ||
		clientRef.current.client.isDisposed
	) {
		const prev = clientRef.current?.client;
		if (prev && !prev.isDisposed) {
			queueMicrotask(() => prev.dispose());
		}
		clientRef.current = {
			client: new DurableChatClient<TTools>({
				...clientOptions,
				onError: (err) => onErrorRef.current(err),
			} as DurableChatClientOptions<TTools>),
			key,
		};
	}

	const client = clientRef.current.client;

	const messageRows = useCollectionData(client.collections.messages);
	const activeGenerations = useCollectionData(
		client.collections.activeGenerations,
	);
	const sessionMetaRows = useCollectionData(client.collections.sessionMeta);

	const messages = useMemo(
		() => messageRows.map(messageRowToUIMessage),
		[messageRows],
	);

	const isLoading = activeGenerations.length > 0;
	const connectionStatus =
		sessionMetaRows[0]?.connectionStatus ?? "disconnected";

	useEffect(() => {
		if (autoConnect && client.connectionStatus === "disconnected") {
			client.connect().catch((err) => {
				setError(err instanceof Error ? err : new Error(String(err)));
			});
		}

		// Cleanup: defer disposal via microtask — dispose() triggers collection events
		// that call setState. When Radix UI uses flushSync for dropdown selection,
		// this cleanup runs during a synchronous render which would cause
		// "Cannot update a component while rendering" if dispose runs inline.
		return () => {
			if (!providedClient) {
				const c = client;
				queueMicrotask(() => {
					if (!c.isDisposed) c.dispose();
				});
			}
		};
	}, [client, autoConnect, providedClient]);

	// Action Callbacks

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

	const append = useCallback(
		async (message: UIMessage | { role: string; content: string }) => {
			try {
				await client.append(message);
			} catch (err) {
				setError(err instanceof Error ? err : new Error(String(err)));
				throw err;
			}
		},
		[client],
	);

	const stop = useCallback(async () => {
		try {
			await client.stop();
		} catch (err) {
			setError(err instanceof Error ? err : new Error(String(err)));
		}
	}, [client]);

	const clear = useCallback(() => {
		client.clear();
	}, [client]);

	const addToolResult = useCallback(
		async (
			result: Parameters<DurableChatClient<TTools>["addToolResult"]>[0],
		) => {
			await client.addToolResult(result);
		},
		[client],
	);

	const addToolApprovalResponse = useCallback(
		async (
			response: Parameters<
				DurableChatClient<TTools>["addToolApprovalResponse"]
			>[0],
		) => {
			await client.addToolApprovalResponse(response);
		},
		[client],
	);

	const addToolAnswerResponse = useCallback(
		async (
			response: Parameters<
				DurableChatClient<TTools>["addToolAnswerResponse"]
			>[0],
		) => {
			await client.addToolAnswerResponse(response);
		},
		[client],
	);

	const fork = useCallback(
		async (opts?: Parameters<DurableChatClient<TTools>["fork"]>[0]) => {
			return client.fork(opts);
		},
		[client],
	);

	const registerAgents = useCallback(
		async (
			agents: Parameters<DurableChatClient<TTools>["registerAgents"]>[0],
		) => {
			await client.registerAgents(agents);
		},
		[client],
	);

	const unregisterAgent = useCallback(
		async (agentId: string) => {
			await client.unregisterAgent(agentId);
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

	const pause = useCallback(() => {
		client.pause();
	}, [client]);

	const resume = useCallback(async () => {
		await client.resume();
	}, [client]);

	return {
		// TanStack AI useChat compatible
		messages,
		sendMessage,
		append,
		stop,
		clear,
		isLoading,
		error,
		addToolResult,
		addToolApprovalResponse,
		addToolAnswerResponse,

		// Durable extensions
		client,
		collections: client.collections,
		connectionStatus,
		fork,
		registerAgents,
		unregisterAgent,
		connect,
		disconnect,
		pause,
		resume,
	};
}
