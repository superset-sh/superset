import type {
	EventsWindow,
	GetEventsInput,
	GetSessionInput,
	HostSnapshot,
	PermissionRequest,
	ResolveToolCallInput,
	Session,
	SessionEvent,
	SessionId,
	SessionSnapshot,
	Thread,
	ThreadId,
	ToolCall,
	ToolCallId,
	ToolResolverDescriptor,
} from "../protocol";

export interface WebSocketLike {
	readonly readyState: number;
	readonly bufferedAmount?: number;
	onopen: (() => void) | null;
	onmessage: ((event: { data: unknown }) => void) | null;
	onclose:
		| ((event: { code?: number; reason?: string; wasClean?: boolean }) => void)
		| null;
	onerror: ((event: unknown) => void) | null;
	send(data: string): void;
	close(code?: number, reason?: string): void;
}

export type ConnectionStatus =
	| "disconnected"
	| "connecting"
	| "connected"
	| "reconnecting";

export type SessionStreamStatus =
	| "idle"
	| "subscribing"
	| "replaying"
	| "live"
	| "reset"
	| "error";

export type SessionRetention = "focused" | "running" | "warm" | "none";

export interface SessionStreamState {
	status: SessionStreamStatus;
	latestCursor: string | null;
	oldestCursor: string | null;
	hasOlder: boolean;
	eventIds: string[];
	eventsById: Record<string, SessionEvent>;
	estimatedEventBytes: number;
	retainCount: number;
	retention: SessionRetention;
	lastAccessedAt: number;
	error: { code: string; retryable: boolean } | null;
}

export interface SessionsSyncState {
	connection: {
		status: ConnectionStatus;
		hostId: string | null;
		connectionId: string | null;
		error: { code: string; retryable: boolean } | null;
	};
	hostSubscription: {
		status: SessionStreamStatus;
		latestCursor: string | null;
	};
	sessionsById: Record<SessionId, Session>;
	sessionOrder: SessionId[];
	threadsById: Record<ThreadId, Thread>;
	pendingPermissionsById: Record<string, PermissionRequest>;
	clientToolCallsById: Record<ToolCallId, ToolCall>;
	streamsBySessionId: Record<SessionId, SessionStreamState>;
	totalEstimatedEventBytes: number;
}

export interface SessionsSyncLimits {
	maxWarmSubscriptions: number;
	warmSubscriptionTtlMs: number;
	maxEventsPerSession: number;
	maxEstimatedBytesPerSession: number;
	maxTotalEstimatedEventBytes: number;
	maxSocketQueuedBytes: number;
	maxFrameBytes: number;
	/**
	 * Reset circuit breaker: more than `maxStreamResetsPerWindow` resets on
	 * one stream inside `streamResetWindowMs` stops auto-recovery and parks
	 * the stream in `error` — a reset loop is a host bug, never something a
	 * client can subscribe its way out of.
	 */
	maxStreamResetsPerWindow: number;
	streamResetWindowMs: number;
}

export const DEFAULT_SESSIONS_SYNC_LIMITS: SessionsSyncLimits = {
	maxWarmSubscriptions: 10,
	warmSubscriptionTtlMs: 30 * 60 * 1_000,
	maxEventsPerSession: 10_000,
	maxEstimatedBytesPerSession: 32 * 1024 * 1024,
	maxTotalEstimatedEventBytes: 128 * 1024 * 1024,
	maxSocketQueuedBytes: 8 * 1024 * 1024,
	maxFrameBytes: 1024 * 1024,
	maxStreamResetsPerWindow: 3,
	streamResetWindowMs: 30_000,
};

export type SessionsSyncLogEvent =
	| {
			event: "sessions_sync.cache_evicted";
			sessionId: SessionId;
			reason: "session_event_limit" | "session_byte_limit" | "total_byte_limit";
			eventsDropped: number;
			estimatedBytesFreed: number;
			oldestRetainedCursor: string | null;
			totalEstimatedBytesAfter: number;
	  }
	| {
			event: "sessions_sync.subscription_disposed";
			sessionId: SessionId;
			reason: "warm_lru_eviction" | "warm_ttl" | "client_disconnect";
			warmRank: number | null;
			latestCursor: string | null;
	  }
	| {
			event: "sessions_sync.socket_dropped";
			reason: "invalid_frame" | "frame_size_limit" | "send_buffer_limit";
			queuedBytes: number | null;
			limitBytes: number;
	  }
	| {
			event: "sessions_sync.stream_reset";
			sessionId: SessionId | null;
			code: string;
			recovery: string;
	  }
	| {
			// A schema-valid session-scoped packet for a session with no
			// subscription sent on this socket: dropped, never folded.
			event: "sessions_sync.stale_packet_dropped";
			sessionId: SessionId;
			packetType: string;
	  }
	| {
			event: "sessions_sync.connect_failed";
			reason: "socket_factory_threw" | "sync_url_failed";
	  }
	| {
			// The reset circuit breaker tripped: the stream is parked in `error`
			// and will not auto-resubscribe until the client reconnects.
			event: "sessions_sync.reset_loop";
			sessionId: SessionId | null;
			resets: number;
			windowMs: number;
	  };

export interface SessionsSyncLogger {
	log(event: SessionsSyncLogEvent): void;
}

/**
 * The injected typed `sessions.*` facade. Each method mirrors one tRPC
 * procedure and takes that procedure's canonical input object. Snapshots
 * ride here — `list` and `get` are the cold path the socket resumes from.
 */
export interface SessionsSyncApi {
	list(): Promise<HostSnapshot>;
	get(input: GetSessionInput): Promise<SessionSnapshot>;
	getEvents(input: GetEventsInput): Promise<EventsWindow>;
	resolveToolCall(input: ResolveToolCallInput): Promise<void>;
}

export interface CreateSessionsSyncClientOptions {
	clientInstanceId: string;
	clientVersion: string;
	syncUrl: string | (() => string | Promise<string>);
	/** Required: snapshots ride tRPC, so the client cannot cold-start without it. */
	api: SessionsSyncApi;
	createWebSocket?: (url: string, protocols: string[]) => WebSocketLike;
	logger?: SessionsSyncLogger;
	limits?: Partial<SessionsSyncLimits>;
	reconnectDelayMs?: number;
	now?: () => number;
}

export interface SessionsSyncClient {
	readonly store: import("zustand/vanilla").StoreApi<SessionsSyncState>;
	connect(): void;
	disconnect(): void;
	retainSession(
		sessionId: SessionId,
		reason: Exclude<SessionRetention, "none">,
	): () => void;
	fetchOlderEvents(
		sessionId: SessionId,
		options?: { limit?: number },
	): Promise<void>;
	registerToolResolver(descriptor: ToolResolverDescriptor): () => void;
	/**
	 * Answer a client tool call (`ui.ask_user`-style). No claim step: the
	 * card renders on every capable device and the first resolve to reach
	 * the host wins; later resolves reject with the host's stale error.
	 */
	resolveToolCall(input: {
		toolCallId: ToolCallId;
		outcome: ResolveToolCallInput["outcome"];
	}): Promise<void>;
}
