import { useEffect, useRef } from "react";
import { useUpdateLastActivityAt } from "renderer/hooks/useUpdateLastActivityAt";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { trackTerminalActivity } from "./trackTerminalActivity";

interface UseTerminalActivityTrackingOptions {
	terminalId: string;
	terminalInstanceId: string;
	workspaceId: string;
	connectionState: string;
}

/**
 * Subscribes to user keystrokes on the xterm instance and
 * periodically updates `lastActivityAt` for the workspace so the
 * sidebar "sort by recent" feature works for v2 terminals.
 */
export function useTerminalActivityTracking({
	terminalId,
	terminalInstanceId,
	workspaceId,
	connectionState,
}: UseTerminalActivityTrackingOptions): void {
	const updateLastActivityAt = useUpdateLastActivityAt();
	const updateRef = useRef(updateLastActivityAt);
	updateRef.current = updateLastActivityAt;

	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState re-derives the terminal ref after reconnect
	useEffect(() => {
		const terminal = terminalRuntimeRegistry.getTerminal(
			terminalId,
			terminalInstanceId,
		);
		if (!terminal) return;

		const tracker = trackTerminalActivity(Date.now());
		const subscription = terminal.onData(() => {
			tracker.handleData(updateRef.current, workspaceId);
		});

		return () => subscription.dispose();
	}, [terminalId, terminalInstanceId, workspaceId, connectionState]);
}
