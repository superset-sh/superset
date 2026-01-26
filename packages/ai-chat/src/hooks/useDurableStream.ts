/**
 * Hook for subscribing to a Durable Stream
 *
 * Provides real-time token streaming via SSE with automatic reconnection
 * and resume from last offset.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamEntry, StreamEvent } from "../types";

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
	events: StreamEntry[];
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

	const [events, setEvents] = useState<StreamEntry[]>([]);
	const [streamingContent, setStreamingContent] = useState("");
	const [isConnected, setIsConnected] = useState(false);
	const [isStreaming, setIsStreaming] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Track last offset for resume
	const lastOffsetRef = useRef(0);
	const eventSourceRef = useRef<EventSource | null>(null);
	const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
		null,
	);

	const clear = useCallback(() => {
		setEvents([]);
		setStreamingContent("");
		lastOffsetRef.current = 0;
	}, []);

	const connect = useCallback(() => {
		if (!sessionId || !enabled) return;

		// Close existing connection
		if (eventSourceRef.current) {
			eventSourceRef.current.close();
		}

		const url = `${baseUrl}/streams/${sessionId}?live=true&offset=${lastOffsetRef.current}`;
		console.log(`[useDurableStream] Connecting to ${url}`);

		const eventSource = new EventSource(url);
		eventSourceRef.current = eventSource;

		eventSource.onopen = () => {
			console.log(`[useDurableStream] Connected`);
			setIsConnected(true);
			setError(null);
			onConnectionChange?.(true);
		};

		eventSource.addEventListener("event", (e) => {
			try {
				const entry = JSON.parse(e.data) as StreamEntry;
				lastOffsetRef.current = entry.offset + 1;

				setEvents((prev) => [...prev, entry]);

				// Accumulate text content
				if (entry.event.type === "text_delta") {
					setIsStreaming(true);
					const textEvent = entry.event;
					setStreamingContent((prev: string) => prev + textEvent.text);
				}

				// Reset streaming on message complete
				if (entry.event.type === "message_complete") {
					setIsStreaming(false);
				}

				onEvent?.(entry.event);
			} catch (err) {
				console.error(`[useDurableStream] Failed to parse event:`, err);
			}
		});

		eventSource.addEventListener("heartbeat", () => {
			// Heartbeat received, connection is alive
		});

		eventSource.onerror = (e) => {
			console.error(`[useDurableStream] Error:`, e);
			setIsConnected(false);
			setIsStreaming(false);
			onConnectionChange?.(false);

			const err = new Error("Stream connection error");
			setError(err);
			onError?.(err);

			// Reconnect after delay
			eventSource.close();
			eventSourceRef.current = null;

			if (enabled) {
				reconnectTimeoutRef.current = setTimeout(() => {
					console.log(`[useDurableStream] Reconnecting...`);
					connect();
				}, 2000);
			}
		};
	}, [sessionId, baseUrl, enabled, onEvent, onError, onConnectionChange]);

	// Connect on mount and when sessionId changes
	useEffect(() => {
		if (sessionId && enabled) {
			connect();
		}

		return () => {
			if (eventSourceRef.current) {
				eventSourceRef.current.close();
				eventSourceRef.current = null;
			}
			if (reconnectTimeoutRef.current) {
				clearTimeout(reconnectTimeoutRef.current);
				reconnectTimeoutRef.current = null;
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
