import {
	type ElicitationResult,
	emptyTimeline,
	type FoldedTimeline,
	foldEnvelope,
	type SessionCatalog,
	type SessionEventEnvelope,
	type SessionPermissionMode,
	type SessionPermissionResult,
	type SessionScopedState,
	type SessionsApi,
	timelineFromSessionMessages,
	type UserDialogResult,
} from "@superset/session-protocol";
import {
	type SessionSubscription,
	type StreamStatus,
	subscribeToSession,
} from "@superset/session-protocol/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWorkspaceHost } from "@/hooks/useWorkspaceHost";
import { loadSessionHistory } from "@/lib/host-service/session-pages";
import {
	createHostSessionsApi,
	createSessionStreamUrlFactory,
} from "@/lib/host-service/sessions-client";
import {
	createQuestionResponse,
	createUserMessage,
} from "../../utils/sessionMessages";
import {
	createOrRecoverSessionState,
	isSessionSynchronizationReady,
	sessionSynchronizationRetryDelayMs,
} from "./sessionSynchronization";

export interface UseClaudeSessionThreadResult {
	hostId: string | null;
	organizationId: string | null;
	hostOnline: boolean;
	workspaceResolving: boolean;
	state: SessionScopedState | null;
	timeline: FoldedTimeline;
	catalog: SessionCatalog | null;
	streamStatus: StreamStatus;
	isSynchronized: boolean;
	isLoading: boolean;
	isSending: boolean;
	isRetrying: boolean;
	error: string | null;
	sendMessage(text: string): Promise<void>;
	retry(): Promise<void>;
	interrupt(): Promise<void>;
	setModel(model?: string): Promise<void>;
	setPermissionMode(permissionMode: SessionPermissionMode): Promise<void>;
	respondToPermission(
		requestId: string,
		response: SessionPermissionResult,
	): Promise<void>;
	respondToQuestion(
		request: SessionScopedState["pendingPermissions"][number],
		answers: Record<string, string>,
	): Promise<void>;
	respondToUserDialog(
		requestId: string,
		response: UserDialogResult,
	): Promise<void>;
	respondToElicitation(
		requestId: string,
		response: ElicitationResult,
	): Promise<void>;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export function useClaudeSessionThread(params: {
	sessionId: string;
	workspaceId: string;
}): UseClaudeSessionThreadResult {
	const { sessionId, workspaceId } = params;
	const { workspace, host, isResolving } = useWorkspaceHost(workspaceId);
	const organizationId = workspace?.organizationId ?? null;
	const hostId = workspace?.hostId ?? null;
	const hostOnline = host?.isOnline ?? false;

	const api = useMemo(() => {
		if (!organizationId || !hostId) return null;
		return createHostSessionsApi({ organizationId, hostId });
	}, [organizationId, hostId]);

	const streamUrl = useMemo(() => {
		if (!organizationId || !hostId) return null;
		return createSessionStreamUrlFactory({
			organizationId,
			hostId,
			sessionId,
		});
	}, [organizationId, hostId, sessionId]);

	const [state, setState] = useState<SessionScopedState | null>(null);
	const [timeline, setTimeline] = useState<FoldedTimeline>(emptyTimeline);
	const [catalog, setCatalog] = useState<SessionCatalog | null>(null);
	const [streamStatus, setStreamStatus] = useState<StreamStatus>("stopped");
	const [historyHydrated, setHistoryHydrated] = useState(false);
	const [isLoading, setIsLoading] = useState(false);
	const [isSending, setIsSending] = useState(false);
	const [isRetrying, setIsRetrying] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [resyncEpoch, setResyncEpoch] = useState(0);
	const sendInFlight = useRef(false);
	const synchronizationReadyRef = useRef(false);
	const isSynchronized = isSessionSynchronizationReady({
		hostOnline,
		historyHydrated,
		streamStatus,
	});

	useEffect(() => {
		// Retry deliberately advances this epoch to recreate the entire transport
		// even though the numeric value is not part of the network request.
		void resyncEpoch;
		if (!api || !streamUrl || !hostOnline) {
			synchronizationReadyRef.current = false;
			setHistoryHydrated(false);
			setStreamStatus("stopped");
			setIsLoading(false);
			return;
		}
		const sessionsApi = api;
		const sessionStreamUrl = streamUrl;

		let disposed = false;
		let syncGeneration = 0;
		let consecutiveFailures = 0;
		let subscription: SessionSubscription | null = null;
		let resyncTimer: ReturnType<typeof setTimeout> | null = null;

		function scheduleSynchronization(delayMs: number): void {
			if (disposed) return;
			if (resyncTimer !== null) clearTimeout(resyncTimer);
			resyncTimer = setTimeout(() => {
				resyncTimer = null;
				void synchronize();
			}, delayMs);
		}

		async function synchronize(): Promise<void> {
			const generation = ++syncGeneration;
			subscription?.close();
			subscription = null;
			synchronizationReadyRef.current = false;
			setHistoryHydrated(false);
			setIsLoading(true);

			try {
				// Create is deliberately idempotent: the same deep link either starts a
				// live SDK query or reconnects to the existing host-local one. If the
				// response is lost after installing an errored tombstone, recover it so
				// the explicit Retry action remains reachable.
				const initialState = await createOrRecoverSessionState(sessionsApi, {
					sessionId,
					workspaceId,
				});
				if (disposed || generation !== syncGeneration) return;
				setState(initialState);

				const buffered: SessionEventEnvelope[] = [];
				let historyReady = false;
				const connection = { status: "connecting" as StreamStatus };
				const updateState = (envelope: SessionEventEnvelope) => {
					if (envelope.frame.kind === "state") {
						setState(envelope.frame.state);
					}
				};

				subscription = subscribeToSession({
					streamUrl: sessionStreamUrl,
					since: initialState.lastSeq,
					sessionId,
					onEnvelope(envelope) {
						if (disposed || generation !== syncGeneration) return;
						updateState(envelope);
						if (!historyReady) {
							buffered.push(envelope);
							return;
						}
						setTimeline((current) => foldEnvelope(current, envelope));
					},
					onReset(reason) {
						if (disposed || generation !== syncGeneration) return;
						synchronizationReadyRef.current = false;
						setHistoryHydrated(false);
						setError(`Session stream reset (${reason}); resynchronizing…`);
						consecutiveFailures = 0;
						scheduleSynchronization(0);
					},
					onStatus(nextStatus) {
						if (!disposed && generation === syncGeneration) {
							connection.status = nextStatus;
							synchronizationReadyRef.current =
								nextStatus === "open" && historyReady;
							setStreamStatus(nextStatus);
							if (nextStatus === "open" && historyReady) setError(null);
						}
					},
					onInvalidEnvelope(reason) {
						if (!disposed && generation === syncGeneration) {
							synchronizationReadyRef.current = false;
							setError(`${reason}; reconnecting…`);
						}
					},
				});

				const [messages, nextCatalog] = await Promise.all([
					loadSessionHistory(sessionsApi, sessionId),
					// Initialization can fail before the SDK returns a catalog. The
					// authoritative errored tombstone and transcript are still a complete
					// recovery surface, and Retry does not require catalog data.
					initialState.status === "errored"
						? Promise.resolve(null)
						: sessionsApi.getCatalog({ sessionId }),
				]);
				if (disposed || generation !== syncGeneration) return;

				let hydrated = timelineFromSessionMessages(messages);
				for (const envelope of buffered) {
					hydrated = foldEnvelope(hydrated, envelope);
				}
				historyReady = true;
				setTimeline(hydrated);
				setCatalog(nextCatalog);
				setHistoryHydrated(true);
				synchronizationReadyRef.current = connection.status === "open";
				consecutiveFailures = 0;
				setError(null);
				setIsLoading(false);
			} catch (cause) {
				if (disposed || generation !== syncGeneration) return;
				subscription?.close();
				subscription = null;
				synchronizationReadyRef.current = false;
				setHistoryHydrated(false);
				setStreamStatus("stopped");
				consecutiveFailures += 1;
				const delayMs = sessionSynchronizationRetryDelayMs(consecutiveFailures);
				setError(`${errorMessage(cause)} Retrying session sync…`);
				scheduleSynchronization(delayMs);
			}
		}

		synchronizationReadyRef.current = false;
		setState(null);
		setTimeline(emptyTimeline());
		setCatalog(null);
		setHistoryHydrated(false);
		setError(null);
		void synchronize();

		return () => {
			disposed = true;
			syncGeneration += 1;
			synchronizationReadyRef.current = false;
			if (resyncTimer !== null) clearTimeout(resyncTimer);
			subscription?.close();
		};
	}, [api, hostOnline, resyncEpoch, sessionId, streamUrl, workspaceId]);

	const runAction = useCallback(
		async (action: (client: SessionsApi) => Promise<unknown>) => {
			if (!api) throw new Error("Host client unavailable");
			if (!hostOnline || !synchronizationReadyRef.current) {
				const cause = new Error(
					"Session is not synchronized with the host; wait for reconnection",
				);
				setError(cause.message);
				throw cause;
			}
			setError(null);
			try {
				await action(api);
			} catch (cause) {
				setError(errorMessage(cause));
				throw cause;
			}
		},
		[api, hostOnline],
	);

	const sendMessage = useCallback(
		async (text: string) => {
			const trimmed = text.trim();
			if (!trimmed) return;
			if (sendInFlight.current) {
				throw new Error("A message is already being admitted");
			}
			sendInFlight.current = true;
			setIsSending(true);
			try {
				await runAction((client) =>
					client.sendMessage({
						sessionId,
						message: createUserMessage(trimmed),
					}),
				);
				// Admission updates the host to running before it acknowledges. Reflect
				// that authoritative transition immediately, but never overwrite a newer
				// streamed state such as requires_action or errored.
				setState((current) =>
					current?.status === "idle"
						? { ...current, status: "running" }
						: current,
				);
			} finally {
				sendInFlight.current = false;
				setIsSending(false);
			}
		},
		[runAction, sessionId],
	);
	const retry = useCallback(async () => {
		setIsRetrying(true);
		try {
			await runAction(async (client) => {
				const restarted = await client.retry({ sessionId });
				setState(restarted);
				// Retry replaces the host journal and native Query. Do not rely on the
				// old WebSocket's terminal reset winning a race with the mutation reply;
				// force state, native history, catalog, and stream to reattach together.
				setResyncEpoch((current) => current + 1);
			});
		} finally {
			setIsRetrying(false);
		}
	}, [runAction, sessionId]);

	const interrupt = useCallback(
		() => runAction((client) => client.interrupt({ sessionId })),
		[runAction, sessionId],
	);
	const setModel = useCallback(
		(model?: string) =>
			runAction((client) => client.setModel({ sessionId, model })),
		[runAction, sessionId],
	);
	const setPermissionMode = useCallback(
		(permissionMode: SessionPermissionMode) =>
			runAction((client) =>
				client.setPermissionMode({ sessionId, permissionMode }),
			),
		[runAction, sessionId],
	);
	const respondToPermission = useCallback(
		(requestId: string, response: SessionPermissionResult) =>
			runAction((client) =>
				client.respondToPermission({ sessionId, requestId, response }),
			),
		[runAction, sessionId],
	);
	const respondToQuestion = useCallback(
		(
			request: SessionScopedState["pendingPermissions"][number],
			answers: Record<string, string>,
		) =>
			respondToPermission(
				request.requestId,
				createQuestionResponse(request, answers),
			),
		[respondToPermission],
	);
	const respondToUserDialog = useCallback(
		(requestId: string, response: UserDialogResult) =>
			runAction((client) =>
				client.respondToUserDialog({ sessionId, requestId, response }),
			),
		[runAction, sessionId],
	);
	const respondToElicitation = useCallback(
		(requestId: string, response: ElicitationResult) =>
			runAction((client) =>
				client.respondToElicitation({ sessionId, requestId, response }),
			),
		[runAction, sessionId],
	);

	return {
		hostId,
		organizationId,
		hostOnline,
		workspaceResolving: isResolving,
		state,
		timeline,
		catalog,
		streamStatus,
		isSynchronized,
		isLoading: Boolean(api && hostOnline) && isLoading,
		isSending,
		isRetrying,
		error,
		sendMessage,
		retry,
		interrupt,
		setModel,
		setPermissionMode,
		respondToPermission,
		respondToQuestion,
		respondToUserDialog,
		respondToElicitation,
	};
}
