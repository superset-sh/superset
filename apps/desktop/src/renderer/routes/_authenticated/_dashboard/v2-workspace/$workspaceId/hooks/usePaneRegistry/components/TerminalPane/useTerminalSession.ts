import { useWorkspaceClient } from "@superset/workspace-client";
import {
	useCallback,
	useEffect,
	useRef,
	useState,
	useSyncExternalStore,
} from "react";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import { useWorkspaceWsUrl } from "../../../../../providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 500;

type SessionState = "creating" | "ready" | "error";

async function postCreateSession(
	hostUrl: string,
	terminalId: string,
	workspaceId: string,
	signal: AbortSignal,
	token: string | null,
): Promise<void> {
	const url = new URL("/terminal/sessions", hostUrl);
	if (token) {
		url.searchParams.set("token", token);
	}
	const res = await fetch(url.href, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ terminalId, workspaceId }),
		signal,
	});
	if (!res.ok) {
		const body = await res.json().catch(() => ({}));
		throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
	}
}

export interface UseTerminalSessionResult {
	sessionState: SessionState;
	connectionState: ConnectionState;
	errorMessage: string | null;
	containerRef: React.RefObject<HTMLDivElement | null>;
	retry: () => void;
}

export function useTerminalSession(
	terminalId: string,
	workspaceId: string,
): UseTerminalSessionResult {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const { hostUrl, getWsToken } = useWorkspaceClient();
	const [sessionState, setSessionState] = useState<SessionState>("creating");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const controllerRef = useRef<AbortController>(new AbortController());

	const websocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`, {
		workspaceId,
	});

	const connectionState = useSyncExternalStore(
		useCallback(
			(callback: () => void) =>
				terminalRuntimeRegistry.onStateChange(terminalId, callback),
			[terminalId],
		),
		() => terminalRuntimeRegistry.getConnectionState(terminalId),
	);

	const startCreateSession = useCallback(() => {
		controllerRef.current.abort();
		const controller = new AbortController();
		controllerRef.current = controller;
		const { signal } = controller;

		setSessionState("creating");
		setErrorMessage(null);

		let attempt = 0;
		const tryOnce = () => {
			if (signal.aborted) return;
			postCreateSession(hostUrl, terminalId, workspaceId, signal, getWsToken())
				.then(() => {
					if (!signal.aborted) setSessionState("ready");
				})
				.catch((err: Error) => {
					if (signal.aborted) return;
					attempt++;
					if (attempt < MAX_ATTEMPTS) {
						const delay = BASE_DELAY_MS * 2 ** (attempt - 1);
						setTimeout(tryOnce, delay);
					} else {
						setErrorMessage(err.message);
						setSessionState("error");
					}
				});
		};
		tryOnce();
	}, [hostUrl, terminalId, workspaceId, getWsToken]);

	// Create session on mount
	useEffect(() => {
		startCreateSession();
		return () => controllerRef.current.abort();
	}, [startCreateSession]);

	// Attach runtime once session is ready
	useEffect(() => {
		if (sessionState !== "ready") return;
		const container = containerRef.current;
		if (!container) return;

		terminalRuntimeRegistry.attach(terminalId, container, websocketUrl);

		return () => {
			terminalRuntimeRegistry.detach(terminalId);
		};
	}, [terminalId, websocketUrl, sessionState]);

	// Auto-reconnect on websocket close
	const prevConnectionStateRef = useRef<ConnectionState>(connectionState);
	useEffect(() => {
		const prev = prevConnectionStateRef.current;
		prevConnectionStateRef.current = connectionState;

		if (
			connectionState === "closed" &&
			prev !== "closed" &&
			sessionState === "ready"
		) {
			startCreateSession();
		}
	}, [connectionState, sessionState, startCreateSession]);

	return {
		sessionState,
		connectionState,
		errorMessage,
		containerRef,
		retry: startCreateSession,
	};
}
