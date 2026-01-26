/**
 * Hook for creating and managing a StreamDB instance
 *
 * Uses @durable-streams/state to create TanStack DB collections
 * backed by a Durable Stream for real-time sync.
 */

import { createStreamDB, type StreamDB } from "@durable-streams/state";
import { useEffect, useMemo, useRef, useState } from "react";
import { sessionStateSchema, type SessionStateSchema } from "./schema";

export interface UseStreamDBOptions {
	/** Base URL of the durable stream server */
	baseUrl: string;
	/** Session ID to connect to */
	sessionId: string;
	/** Whether to enable the connection */
	enabled?: boolean;
	/** Callback when connected */
	onConnected?: () => void;
	/** Callback when error occurs */
	onError?: (error: Error) => void;
}

export interface UseStreamDBResult {
	/** The StreamDB instance with typed collections */
	db: StreamDB<SessionStateSchema> | null;
	/** Whether the stream is loading initial data */
	isLoading: boolean;
	/** Whether the stream is connected */
	isConnected: boolean;
	/** Last error if any */
	error: Error | null;
}

/**
 * Hook to create and manage a StreamDB instance for a chat session
 *
 * @example
 * ```tsx
 * const { db, isLoading, isConnected } = useStreamDB({
 *   baseUrl: "http://localhost:8080",
 *   sessionId: "my-session-id",
 * });
 *
 * // Use with TanStack DB live queries
 * const { data: messages } = useLiveQuery(q =>
 *   q.from({ chunk: db.collections.chunks })
 *     .orderBy(({ chunk }) => chunk.seq, 'asc')
 * );
 * ```
 */
export function useStreamDB(options: UseStreamDBOptions): UseStreamDBResult {
	const { baseUrl, sessionId, enabled = true, onConnected, onError } = options;

	const [isLoading, setIsLoading] = useState(true);
	const [isConnected, setIsConnected] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const dbRef = useRef<StreamDB<SessionStateSchema> | null>(null);

	// Create stable options ref for callbacks
	const optionsRef = useRef({ onConnected, onError });
	optionsRef.current = { onConnected, onError };

	// Create the StreamDB instance
	const db = useMemo(() => {
		if (!enabled || !sessionId) return null;

		const url = `${baseUrl}/streams/${sessionId}`;

		const streamDb = createStreamDB({
			streamOptions: {
				url,
			},
			state: sessionStateSchema,
		});

		dbRef.current = streamDb;
		return streamDb;
	}, [baseUrl, sessionId, enabled]);

	// Preload the stream data
	useEffect(() => {
		if (!db) {
			setIsLoading(false);
			setIsConnected(false);
			return;
		}

		let cancelled = false;

		const connect = async () => {
			setIsLoading(true);
			setError(null);

			try {
				await db.preload();

				if (!cancelled) {
					setIsConnected(true);
					setIsLoading(false);
					optionsRef.current.onConnected?.();
				}
			} catch (err) {
				if (!cancelled) {
					const error = err instanceof Error ? err : new Error(String(err));
					setError(error);
					setIsLoading(false);
					setIsConnected(false);
					optionsRef.current.onError?.(error);
				}
			}
		};

		connect();

		return () => {
			cancelled = true;
			db.close();
		};
	}, [db]);

	return {
		db,
		isLoading,
		isConnected,
		error,
	};
}

/**
 * Re-export TanStack DB utilities for convenience
 */
export {
	createOptimisticAction,
	eq,
	and,
	or,
	gt,
	lt,
	gte,
	lte,
	count,
	sum,
	avg,
	min,
	max,
} from "@durable-streams/state";

export { useLiveQuery } from "@tanstack/react-db";
