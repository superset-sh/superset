/**
 * Stream storage and management
 *
 * In-memory implementation for development.
 * Production would use Cloudflare KV or Redis for durability.
 */

import type { StreamEntry, StreamEvent, StreamState } from "./types";

// In-memory store - replace with KV/Redis in production
const streams = new Map<string, StreamState>();

// Active SSE connections for each stream
const subscribers = new Map<string, Set<(event: StreamEntry) => void>>();

/**
 * Create a new stream for a session
 */
export function createStream(sessionId: string): StreamState {
	const existing = streams.get(sessionId);
	if (existing) {
		return existing;
	}

	const stream: StreamState = {
		sessionId,
		events: [],
		nextOffset: 0,
		createdAt: Date.now(),
		updatedAt: Date.now(),
	};

	streams.set(sessionId, stream);
	return stream;
}

/**
 * Get a stream by session ID
 */
export function getStream(sessionId: string): StreamState | undefined {
	return streams.get(sessionId);
}

/**
 * Append an event to a stream
 */
export function appendEvent(
	sessionId: string,
	event: StreamEvent,
): StreamEntry | null {
	const stream = streams.get(sessionId);
	if (!stream) {
		return null;
	}

	const entry: StreamEntry = {
		offset: stream.nextOffset,
		event: {
			...event,
			timestamp: event.timestamp || Date.now(),
		},
	};

	stream.events.push(entry);
	stream.nextOffset += 1;
	stream.updatedAt = Date.now();

	// Notify all subscribers
	const subs = subscribers.get(sessionId);
	if (subs) {
		for (const callback of subs) {
			callback(entry);
		}
	}

	return entry;
}

/**
 * Get events from a stream starting at an offset
 */
export function getEvents(
	sessionId: string,
	fromOffset = 0,
): { events: StreamEntry[]; nextOffset: number } | null {
	const stream = streams.get(sessionId);
	if (!stream) {
		return null;
	}

	const events = stream.events.filter((e) => e.offset >= fromOffset);
	return {
		events,
		nextOffset: stream.nextOffset,
	};
}

/**
 * Subscribe to live events from a stream
 */
export function subscribeToStream(
	sessionId: string,
	callback: (event: StreamEntry) => void,
): () => void {
	let subs = subscribers.get(sessionId);
	if (!subs) {
		subs = new Set();
		subscribers.set(sessionId, subs);
	}

	subs.add(callback);

	// Return unsubscribe function
	return () => {
		subs?.delete(callback);
		if (subs?.size === 0) {
			subscribers.delete(sessionId);
		}
	};
}

/**
 * Delete a stream (cleanup)
 */
export function deleteStream(sessionId: string): boolean {
	const existed = streams.has(sessionId);
	streams.delete(sessionId);
	subscribers.delete(sessionId);
	return existed;
}

/**
 * Get stream statistics
 */
export function getStreamStats(): {
	totalStreams: number;
	totalSubscribers: number;
	streams: Array<{
		sessionId: string;
		eventCount: number;
		subscriberCount: number;
	}>;
} {
	const streamList = Array.from(streams.entries()).map(
		([sessionId, stream]) => ({
			sessionId,
			eventCount: stream.events.length,
			subscriberCount: subscribers.get(sessionId)?.size || 0,
		}),
	);

	return {
		totalStreams: streams.size,
		totalSubscribers: Array.from(subscribers.values()).reduce(
			(sum, s) => sum + s.size,
			0,
		),
		streams: streamList,
	};
}
