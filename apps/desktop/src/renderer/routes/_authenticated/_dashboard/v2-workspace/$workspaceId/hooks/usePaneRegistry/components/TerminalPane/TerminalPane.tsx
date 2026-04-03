import "@xterm/xterm/css/xterm.css";
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

interface TerminalPaneProps {
	terminalId: string;
	workspaceId: string;
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 500;

function subscribeToState(terminalId: string) {
	return (callback: () => void) =>
		terminalRuntimeRegistry.onStateChange(terminalId, callback);
}

function getConnectionState(terminalId: string): ConnectionState {
	return terminalRuntimeRegistry.getConnectionState(terminalId);
}

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

export function TerminalPane({ terminalId, workspaceId }: TerminalPaneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const { hostUrl, getWsToken } = useWorkspaceClient();
	const [sessionState, setSessionState] = useState<SessionState>("creating");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	// Single abort controller for all in-flight create/retry operations.
	// Starting a new operation aborts the previous one; unmount aborts whatever
	// is in flight.
	const controllerRef = useRef<AbortController>(new AbortController());

	const websocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`, {
		workspaceId,
	});

	const connectionState = useSyncExternalStore(
		subscribeToState(terminalId),
		() => getConnectionState(terminalId),
	);

	const startCreateSession = useCallback(() => {
		// Abort any previous in-flight operation
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
					if (attempt < MAX_RETRIES) {
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

	// Create the terminal session in host-service on mount
	useEffect(() => {
		startCreateSession();
		return () => controllerRef.current.abort();
	}, [startCreateSession]);

	// Attach to the terminal runtime only after the session has been created
	useEffect(() => {
		if (sessionState !== "ready") return;
		const container = containerRef.current;
		if (!container) return;

		terminalRuntimeRegistry.attach(terminalId, container, websocketUrl);

		return () => {
			terminalRuntimeRegistry.detach(terminalId);
		};
	}, [terminalId, websocketUrl, sessionState]);

	// Auto-reconnect: when the websocket closes while the session was ready,
	// cycle back through create → attach. This handles host-service restarts
	// (in-memory sessions lost) and transient socket drops.
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

	return (
		<div className="flex h-full w-full flex-col">
			<div
				ref={containerRef}
				className="min-h-0 flex-1 overflow-hidden bg-[#14100f]"
			/>
			{sessionState === "error" && (
				<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
					<span>
						Failed to create session{errorMessage ? `: ${errorMessage}` : ""}
					</span>
					<button
						type="button"
						className="underline hover:text-foreground"
						onClick={startCreateSession}
					>
						Retry
					</button>
				</div>
			)}
			{sessionState === "ready" && connectionState === "closed" && (
				<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
					<span>Reconnecting…</span>
				</div>
			)}
		</div>
	);
}
