/**
 * Hook for subscribing to a Durable Stream
 *
 * Uses the official @durable-streams/client for protocol-compliant streaming
 * with automatic reconnection and resume from last offset.
 */

import { DurableStream } from "@durable-streams/client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamEvent } from "../types";

interface UseDurableStreamOptions {
	/** Base URL of the durable stream server */
	baseUrl: string;
	/** Whether to enable live streaming */
	enabled?: boolean;
	/** Callback when events are received */
	onEvent?: (event: StreamEvent) => void;
	/** Callback when an error occurs */
	onError?: (error: Error) => void;
	/** Callback when connection status changes */
	onConnectionChange?: (connected: boolean) => void;
}

interface UseDurableStreamResult {
	/** All received events */
	events: StreamEvent[];
	/** Current streaming content (accumulated text) */
	streamingContent: string;
	/** Whether currently connected to the stream */
	isConnected: boolean;
	/** Whether actively receiving data */
	isStreaming: boolean;
	/** Last error if any */
	error: Error | null;
	/** Clear all events */
	clear: () => void;
}

export function useDurableStream(
	sessionId: string | null,
	options: UseDurableStreamOptions,
): UseDurableStreamResult {
	const {
		baseUrl,
		enabled = true,
		onEvent,
		onError,
		onConnectionChange,
	} = options;

	const [events, setEvents] = useState<StreamEvent[]>([]);
	const [streamingContent, setStreamingContent] = useState("");
	const [isConnected, setIsConnected] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const abortControllerRef = useRef<AbortController | null>(null);
	const lastOffsetRef = useRef<string | undefined>(undefined);
	const unsubscribeRef = useRef<(() => void) | null>(null);

	const clear = useCallback(() => {
		setEvents([]);
		setStreamingContent("");
		lastOffsetRef.current = undefined;
	}, []);

	const connect = useCallback(async () => {
		if (!sessionId || !enabled) return;

		// Cleanup existing connection
		if (unsubscribeRef.current) {
			unsubscribeRef.current();
			unsubscribeRef.current = null;
		}
		if (abortControllerRef.current) {
			abortControllerRef.current.abort();
		}

		const abortController = new AbortController();
		abortControllerRef.current = abortController;

		const url = `${baseUrl}/streams/${sessionId}`;
		console.log(
			`[useDurableStream] Connecting to ${url} at offset ${lastOffsetRef.current ?? "start"}`,
		);

		try {
			const handle = new DurableStream({ url });

			const response = await handle.stream<StreamEvent>({
				offset: lastOffsetRef.current,
				signal: abortController.signal,
				live: true,
				onError: (err) => {
					console.error(`[useDurableStream] Stream error:`, err);
					// Return empty object to retry
					return {};
				},
			});

			setIsConnected(true);
			setError(null);
			onConnectionChange?.(true);

			// Subscribe to JSON batches
			const unsubscribe = response.subscribeJson(async (batch) => {
				// Update offset after receiving data
				lastOffsetRef.current = response.offset;

				for (const event of batch.items) {
					setEvents((prev) => [...prev, event]);

					// Accumulate text content
					if (event.type === "text_delta" && "text" in event) {
						setIsStreaming(true);
						const textEvent = event as StreamEvent & { text: string };
						setStreamingContent((prev) => prev + textEvent.text);
					}

					// Reset streaming on message complete
					if (event.type === "message_complete") {
						setIsStreaming(false);
					}

					onEvent?.(event);
				}
			});

			unsubscribeRef.current = unsubscribe;

			// Wait for stream to close
			await response.closed;

			// Stream closed, reconnect if still enabled
			if (enabled && !abortController.signal.aborted) {
				console.log(`[useDurableStream] Stream closed, reconnecting...`);
				setTimeout(() => connect(), 1000);
			}
		} catch (err) {
			if (abortController.signal.aborted) {
				return; // Expected abort
			}

			console.error(`[useDurableStream] Error:`, err);
			setIsConnected(false);
			setIsStreaming(false);
			onConnectionChange?.(false);

			const error = err instanceof Error ? err : new Error(String(err));
			setError(error);
			onError?.(error);

			// Reconnect after delay
			if (enabled) {
				setTimeout(() => {
					console.log(`[useDurableStream] Reconnecting...`);
					connect();
				}, 2000);
			}
		}
	}, [sessionId, baseUrl, enabled, onEvent, onError, onConnectionChange]);

	// Connect on mount and when sessionId changes
	useEffect(() => {
		if (sessionId && enabled) {
			connect();
		}

		return () => {
			if (unsubscribeRef.current) {
				unsubscribeRef.current();
				unsubscribeRef.current = null;
			}
			if (abortControllerRef.current) {
				abortControllerRef.current.abort();
				abortControllerRef.current = null;
			}
		};
	}, [sessionId, enabled, connect]);

	return {
		events,
		streamingContent,
		isConnected,
		isStreaming,
		error,
		clear,
	};
}
