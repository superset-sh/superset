import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ContentBlock, RequestPermissionOutcome } from "../../acp";
import type {
	AcpSessionsApi,
	PromptAccepted,
	RespondToPermissionResult,
} from "../../api";
import {
	type SessionSubscription,
	type StreamStatus,
	subscribeToSession,
	type WebSocketLike,
} from "../../client";
import type { SessionUpdateEnvelope } from "../../envelope";
import {
	emptyTimeline,
	type FoldedTimeline,
	foldEnvelope,
	foldEnvelopes,
} from "../../fold";
import type { SessionScopedState } from "../../state";

export interface UseAcpSessionOptions {
	sessionId: string;
	/** Transport for commands + catch-up reads (a tRPC client fits). */
	api: AcpSessionsApi;
	/**
	 * WS endpoint for this session's update stream. Pass a function when the
	 * URL embeds a short-lived token — it is re-invoked on every reconnect.
	 */
	streamUrl: string | (() => string | Promise<string>);
	/** Injectable for tests / non-global WebSocket environments. */
	createWebSocket?: (url: string) => WebSocketLike;
	/** Page size for getMessages catch-up and loadOlder pages (default 50). */
	pageSize?: number;
}

export interface AcpSessionActions {
	/** Acks admission; turn completion arrives via state frames (see api.ts). */
	prompt(blocks: ContentBlock[]): Promise<PromptAccepted>;
	cancel(): Promise<void>;
	respondToPermission(
		requestId: string,
		outcome: RequestPermissionOutcome,
	): Promise<RespondToPermissionResult>;
	setMode(modeId: string): Promise<void>;
	setConfigOption(configId: string, value: string | boolean): Promise<void>;
	/** Full resync: re-fetch state + newest messages, resubscribe. */
	refresh(): Promise<void>;
}

export interface UseAcpSessionResult {
	/** Live session-scoped state (status, pending permissions, modes...). */
	state: SessionScopedState | null;
	/** Folded, render-ready timeline of the loaded pages + live updates. */
	timeline: FoldedTimeline;
	streamStatus: StreamStatus;
	/** True during the initial (or refresh) resync round-trip. */
	isLoading: boolean;
	/** True while the journal holds older pages loadOlder hasn't fetched. */
	hasOlder: boolean;
	/** True while a loadOlder page is in flight. */
	isLoadingOlder: boolean;
	error: Error | null;
	actions: AcpSessionActions;
	/** Prepend the next older history page (no-op when none/in flight). */
	loadOlder: () => void;
}

/**
 * Attach to a host-service ACP session: seed from get + getMessages, fold the
 * WS stream on top, and resync automatically when the server signals reset.
 * All folding/gap/dedup logic lives in the pure `fold` and `client` modules —
 * this hook only orchestrates them.
 */
export function useAcpSession(
	options: UseAcpSessionOptions,
): UseAcpSessionResult {
	const { sessionId, pageSize } = options;

	// Latest transport without making it an effect dependency: callers often
	// build `api`/`streamUrl`/`createWebSocket` inline, and identity churn
	// must not tear down the socket.
	const apiRef = useRef(options.api);
	apiRef.current = options.api;
	const streamUrlRef = useRef(options.streamUrl);
	streamUrlRef.current = options.streamUrl;
	const createWebSocketRef = useRef(options.createWebSocket);
	createWebSocketRef.current = options.createWebSocket;

	const [fetchedState, setFetchedState] = useState<SessionScopedState | null>(
		null,
	);
	const [timeline, setTimeline] = useState<FoldedTimeline>(emptyTimeline);
	const [streamStatus, setStreamStatus] = useState<StreamStatus>("connecting");
	const [isLoading, setIsLoading] = useState(true);
	const [hasOlder, setHasOlder] = useState(false);
	const [isLoadingOlder, setIsLoadingOlder] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	// Fold target between renders; epoch guards resync races (a stale resync
	// or a stale subscription's callbacks must not clobber a newer one).
	const timelineRef = useRef<FoldedTimeline>(timeline);
	// Every envelope folded so far, in seq order — loadOlder prepends a page
	// and refolds from scratch (folding is pure and cheap at journal scale).
	const envelopesRef = useRef<SessionUpdateEnvelope[]>([]);
	// getMessages cursor for the next OLDER page; null = fully paged back.
	const olderCursorRef = useRef<string | null>(null);
	const loadingOlderRef = useRef(false);
	const epochRef = useRef(0);
	const subscriptionRef = useRef<SessionSubscription | null>(null);

	const resync = useCallback(async (): Promise<void> => {
		const epoch = ++epochRef.current;
		subscriptionRef.current?.close();
		subscriptionRef.current = null;
		// Invalidate any older-page request from the previous epoch immediately.
		// Its stale finally block is intentionally ignored, so leaving these set
		// would permanently block loadOlder when this resync fails.
		loadingOlderRef.current = false;
		setIsLoadingOlder(false);
		setIsLoading(true);
		setError(null);
		try {
			const api = apiRef.current;
			const state = await api.get({ sessionId });
			if (epoch !== epochRef.current) return;
			// Publish passive `offline` state before the live history read tries to
			// resurrect it. If session/load fails, the UI can explain that this is a
			// resumable registry row (and keep its composer disabled) alongside the
			// actual load error instead of looking like a brand-new empty thread.
			setFetchedState(state);
			const page = await api.getMessages({ sessionId, limit: pageSize });
			if (epoch !== epochRef.current) return;

			envelopesRef.current = [...page.items];
			olderCursorRef.current = page.nextCursor;
			loadingOlderRef.current = false;
			const seeded = foldEnvelopes(emptyTimeline(), page.items);
			timelineRef.current = seeded;
			setTimeline(seeded);
			setHasOlder(page.nextCursor !== null);
			setIsLoadingOlder(false);
			setIsLoading(false);

			// Empty journal page but a non-zero server cursor (e.g. evicted
			// journal): subscribe from the server's seq to avoid a reset loop.
			const since = seeded.lastSeq > 0 ? seeded.lastSeq : state.lastSeq;
			subscriptionRef.current = subscribeToSession({
				streamUrl: () => {
					const current = streamUrlRef.current;
					return typeof current === "function" ? current() : current;
				},
				since,
				createWebSocket: createWebSocketRef.current,
				onEnvelope: (envelope) => {
					if (epoch !== epochRef.current) return;
					if (envelope.frame.kind === "state") {
						// State frames are full snapshots and last-wins in fold —
						// superseded ones only bloat this refold buffer (they arrive on
						// every status/permission transition for the lifetime of the
						// mount), so keep just the newest.
						envelopesRef.current = envelopesRef.current.filter(
							(buffered) => buffered.frame.kind !== "state",
						);
					}
					envelopesRef.current.push(envelope);
					timelineRef.current = foldEnvelope(timelineRef.current, envelope);
					setTimeline(timelineRef.current);
				},
				onStatus: (status) => {
					if (epoch !== epochRef.current) return;
					setStreamStatus(status);
				},
				onReset: () => {
					if (epoch !== epochRef.current) return;
					void resync();
				},
			});
		} catch (cause) {
			if (epoch !== epochRef.current) return;
			setIsLoading(false);
			setError(cause instanceof Error ? cause : new Error(String(cause)));
		}
	}, [sessionId, pageSize]);

	const loadOlder = useCallback(() => {
		const cursor = olderCursorRef.current;
		if (cursor === null || loadingOlderRef.current) return;
		const epoch = epochRef.current;
		loadingOlderRef.current = true;
		setIsLoadingOlder(true);
		apiRef.current
			.getMessages({ sessionId, cursor, limit: pageSize })
			.then((page) => {
				if (epoch !== epochRef.current) return;
				envelopesRef.current = [...page.items, ...envelopesRef.current];
				olderCursorRef.current = page.nextCursor;
				timelineRef.current = foldEnvelopes(
					emptyTimeline(),
					envelopesRef.current,
				);
				setTimeline(timelineRef.current);
				setHasOlder(page.nextCursor !== null);
			})
			.catch((cause) => {
				// Older history stays available for the next scroll attempt; the
				// live thread is unaffected, so don't surface a blocking error —
				// but leave a trace so a dead scrollback is diagnosable.
				console.warn(`[acp-session] loadOlder failed (${sessionId})`, cause);
			})
			.finally(() => {
				if (epoch !== epochRef.current) return;
				loadingOlderRef.current = false;
				setIsLoadingOlder(false);
			});
	}, [sessionId, pageSize]);

	// The session currently reflected by the rendered state/timeline. When the
	// route swaps sessionIds in place, the old session's thread (and its still-
	// answerable permissions) must not stay visible while the new one loads —
	// clear before resyncing. Same-session resyncs (refresh, reset) keep the
	// existing data rendered during the round trip.
	const renderedSessionIdRef = useRef(sessionId);

	useEffect(() => {
		if (renderedSessionIdRef.current !== sessionId) {
			renderedSessionIdRef.current = sessionId;
			envelopesRef.current = [];
			olderCursorRef.current = null;
			loadingOlderRef.current = false;
			timelineRef.current = emptyTimeline();
			setFetchedState(null);
			setTimeline(timelineRef.current);
			setHasOlder(false);
			setIsLoadingOlder(false);
			setStreamStatus("connecting");
		}
		void resync();
		return () => {
			epochRef.current += 1;
			subscriptionRef.current?.close();
			subscriptionRef.current = null;
		};
	}, [sessionId, resync]);

	const actions = useMemo<AcpSessionActions>(
		() => ({
			prompt: (blocks) => apiRef.current.prompt({ sessionId, prompt: blocks }),
			cancel: () => apiRef.current.cancel({ sessionId }),
			respondToPermission: (requestId, outcome) =>
				apiRef.current.respondToPermission({ sessionId, requestId, outcome }),
			setMode: (modeId) => apiRef.current.setMode({ sessionId, modeId }),
			setConfigOption: (configId, value) =>
				apiRef.current.setConfigOption({ sessionId, configId, value }),
			refresh: () => resync(),
		}),
		[sessionId, resync],
	);

	return {
		// State frames folded from the stream supersede the initial fetch.
		state: timeline.state ?? fetchedState,
		timeline,
		streamStatus,
		isLoading,
		hasOlder,
		isLoadingOlder,
		error,
		actions,
		loadOlder,
	};
}
