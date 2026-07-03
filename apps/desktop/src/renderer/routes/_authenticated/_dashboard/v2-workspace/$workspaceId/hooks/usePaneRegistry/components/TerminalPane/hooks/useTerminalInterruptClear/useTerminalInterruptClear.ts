import { useEffect, useEffectEvent } from "react";
import { useTerminalAgentBinding } from "renderer/hooks/host-service/useTerminalAgentBindings";
import { useWorkspaceHostUrl } from "renderer/hooks/host-service/useWorkspaceHostUrl";
import { getHostServiceClientByUrl } from "renderer/lib/host-service-client";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import { markTerminalSeenNow } from "renderer/stores/v2-notifications";

interface UseTerminalInterruptClearOptions {
	terminalId: string;
	terminalInstanceId: string;
	workspaceId: string;
	connectionState: ConnectionState;
}

/**
 * Ctrl+C / Escape kills the foreground agent turn while the shell stays
 * alive, and Claude Code's Stop hook doesn't fire on user interrupt — so the
 * host binding (the status source of truth) would stay "working". Record a
 * synthetic Stop with the host and mark the terminal seen locally; a real
 * hook event arriving later harmlessly overwrites the synthetic one.
 */
export function useTerminalInterruptClear({
	terminalId,
	terminalInstanceId,
	workspaceId,
	connectionState,
}: UseTerminalInterruptClearOptions): void {
	const hostUrl = useWorkspaceHostUrl(workspaceId);
	const binding = useTerminalAgentBinding(workspaceId, terminalId);

	const recordInterrupt = useEffectEvent(() => {
		markTerminalSeenNow(terminalId);
		const agentActive =
			binding?.lastEventType === "Start" ||
			binding?.lastEventType === "PermissionRequest";
		if (!agentActive || !hostUrl) return;
		getHostServiceClientByUrl(hostUrl)
			.notifications.hook.mutate({ terminalId, eventType: "Stop" })
			.catch((error) => {
				console.warn(
					"[terminal] failed to record synthetic agent stop:",
					error,
				);
			});
	});

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
			recordInterrupt();
		});
		return () => subscription.dispose();
	}, [terminalId, terminalInstanceId, connectionState]);
}
