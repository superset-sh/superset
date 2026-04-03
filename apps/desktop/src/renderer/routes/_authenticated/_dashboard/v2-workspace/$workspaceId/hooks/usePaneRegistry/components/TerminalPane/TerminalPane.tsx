import { useEffect, useRef, useSyncExternalStore } from "react";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import { useWorkspaceWsUrl } from "../../../../../providers/WorkspaceTrpcProvider/WorkspaceTrpcProvider";

interface TerminalPaneProps {
	paneId: string;
	workspaceId: string;
}

function subscribeToState(paneId: string) {
	return (callback: () => void) =>
		terminalRuntimeRegistry.onStateChange(paneId, callback);
}

function getConnectionState(paneId: string): ConnectionState {
	return terminalRuntimeRegistry.getConnectionState(paneId);
}

export function TerminalPane({ paneId, workspaceId }: TerminalPaneProps) {
	const containerRef = useRef<HTMLDivElement | null>(null);

	const websocketUrl = useWorkspaceWsUrl(`/terminal/${paneId}`, {
		workspaceId,
	});

	const connectionState = useSyncExternalStore(subscribeToState(paneId), () =>
		getConnectionState(paneId),
	);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		terminalRuntimeRegistry.attach(paneId, container, websocketUrl);

		return () => {
			terminalRuntimeRegistry.detach(paneId);
		};
	}, [paneId, websocketUrl]);

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
