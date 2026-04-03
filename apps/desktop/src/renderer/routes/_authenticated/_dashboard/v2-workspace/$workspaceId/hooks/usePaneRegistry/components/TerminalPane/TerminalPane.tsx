import "@xterm/xterm/css/xterm.css";
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
import {
	useWorkspaceHostUrl,
	useWorkspaceWsUrl,
} from "../../../../../providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";

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

async function createSession(
	hostUrl: string,
	terminalId: string,
	workspaceId: string,
	signal: AbortSignal,
): Promise<void> {
	const res = await fetch(new URL("/terminal/sessions", hostUrl).href, {
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
	const hostUrl = useWorkspaceHostUrl();
	const [sessionState, setSessionState] = useState<SessionState>("creating");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);

	const websocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`, {
		workspaceId,
	});

	const connectionState = useSyncExternalStore(
		subscribeToState(terminalId),
		() => getConnectionState(terminalId),
	);

	const attemptCreate = useCallback(
		(signal: AbortSignal) => {
			setSessionState("creating");
			setErrorMessage(null);

			let attempt = 0;
			const tryOnce = () => {
				if (signal.aborted) return;
				createSession(hostUrl, terminalId, workspaceId, signal)
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
		},
		[hostUrl, terminalId, workspaceId],
	);

	// Create the terminal session in host-service before attaching via websocket
	useEffect(() => {
		const controller = new AbortController();
		attemptCreate(controller.signal);
		return () => controller.abort();
	}, [attemptCreate]);

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

	const handleRetry = useCallback(() => {
		attemptCreate(new AbortController().signal);
	}, [attemptCreate]);

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
						onClick={handleRetry}
					>
						Retry
					</button>
				</div>
			)}
			{sessionState === "ready" && connectionState === "closed" && (
				<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
					<span>Disconnected</span>
				</div>
			)}
		</div>
	);
}
