import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
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

function subscribeToState(terminalId: string) {
	return (callback: () => void) =>
		terminalRuntimeRegistry.onStateChange(terminalId, callback);
}

function getConnectionState(terminalId: string): ConnectionState {
	return terminalRuntimeRegistry.getConnectionState(terminalId);
}

export function TerminalPane({ terminalId, workspaceId }: TerminalPaneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);
	const hostUrl = useWorkspaceHostUrl();
	const [sessionReady, setSessionReady] = useState(false);
	const createAttemptedRef = useRef(false);

	const websocketUrl = useWorkspaceWsUrl(`/terminal/${terminalId}`, {
		workspaceId,
	});

	const connectionState = useSyncExternalStore(
		subscribeToState(terminalId),
		() => getConnectionState(terminalId),
	);

	// Create the terminal session in host-service before attaching via websocket
	useEffect(() => {
		if (createAttemptedRef.current) return;
		createAttemptedRef.current = true;

		fetch(new URL("/terminal/sessions", hostUrl).href, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				terminalId,
				workspaceId,
			}),
		})
			.then((res) => {
				if (!res.ok) {
					return res.json().then((body) => {
						console.error("[TerminalPane] session create failed:", body);
					});
				}
				setSessionReady(true);
			})
			.catch((err) => {
				console.error("[TerminalPane] session create error:", err);
			});
	}, [terminalId, workspaceId, hostUrl]);

	// Attach to the terminal runtime only after the session has been created
	useEffect(() => {
		if (!sessionReady) return;
		const container = containerRef.current;
		if (!container) return;

		terminalRuntimeRegistry.attach(terminalId, container, websocketUrl);

		return () => {
			terminalRuntimeRegistry.detach(terminalId);
		};
	}, [terminalId, websocketUrl, sessionReady]);

	return (
		<div className="flex h-full w-full flex-col">
			<div
				ref={containerRef}
				className="min-h-0 flex-1 overflow-hidden bg-[#14100f]"
			/>
			{connectionState === "closed" && (
				<div className="flex items-center gap-2 border-t border-border px-3 py-1.5 text-xs text-muted-foreground">
					<span>Disconnected</span>
				</div>
			)}
		</div>
	);
}
