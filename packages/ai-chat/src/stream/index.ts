/**
 * Stream module exports
 *
 * Provides TanStack DB-backed real-time streaming with Durable Streams.
 */

// Schema and types
export {
	chunkSchema,
	presenceSchema,
	draftSchema,
	messageSchema,
	sessionStateSchema,
	type StreamChunk,
	type StreamPresence,
	type StreamDraft,
	type StreamMessage,
	type SessionStateSchema,
} from "./schema";

// Hook and utilities
export {
	useStreamDB,
	useLiveQuery,
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
	type UseStreamDBOptions,
	type UseStreamDBResult,
} from "./useStreamDB";
