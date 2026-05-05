import { useEffect } from "react";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import { clearV2TerminalRunStatus } from "renderer/stores/v2-notifications";

interface UseTerminalInterruptClearOptions {
	terminalId: string;
	terminalInstanceId: string;
	workspaceId: string;
	connectionState: ConnectionState;
}

/**
 * The host's `terminal:lifecycle` exit only fires when the pty dies. Ctrl+C
 * kills the foreground agent process while the shell stays alive, and Claude
 * Code's Stop hook doesn't fire on user interrupt — so without this hook,
 * "working" / "permission" stays stuck in the sidebar.
 */
export function useTerminalInterruptClear({
	terminalId,
	terminalInstanceId,
	workspaceId,
	connectionState,
}: UseTerminalInterruptClearOptions): void {
	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState re-runs the effect on reconnect so we subscribe to the new xterm instance
	useEffect(() => {
		const terminal = terminalRuntimeRegistry.getTerminal(
			terminalId,
			terminalInstanceId,
		);
		if (!terminal) return;
		const subscription = terminal.onKey(({ domEvent }) => {
			const isInterrupt =
				(domEvent.key === "c" && domEvent.ctrlKey) || domEvent.key === "Escape";
			if (!isInterrupt) return;
			clearV2TerminalRunStatus(terminalId, workspaceId);
		});
		return () => subscription.dispose();
	}, [terminalId, terminalInstanceId, workspaceId, connectionState]);
}
