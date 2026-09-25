import { useEffect } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import {
	type ConnectionState,
	terminalRuntimeRegistry,
} from "renderer/lib/terminal/terminal-runtime-registry";
import { copiedIndicatorStore } from "./copiedIndicatorStore";
import { installCopyOnSelect } from "./copyOnSelect";

interface UseCopyOnSelectOptions {
	terminalId: string;
	terminalInstanceId: string;
	connectionState: ConnectionState;
}

/**
 * Wires the "copy on select" terminal setting to this pane's xterm. Off by
 * default, so Cmd+C stays the only way to copy unless the user opts in.
 */
export function useCopyOnSelect({
	terminalId,
	terminalInstanceId,
	connectionState,
}: UseCopyOnSelectOptions): void {
	const { data: copyOnSelect } =
		electronTrpc.settings.getTerminalCopyOnSelect.useQuery();

	// biome-ignore lint/correctness/useExhaustiveDependencies: connectionState re-runs the effect on reconnect so we subscribe to the new xterm instance
	useEffect(() => {
		if (!copyOnSelect) return;
		const terminal = terminalRuntimeRegistry.getTerminal(
			terminalId,
			terminalInstanceId,
		);
		if (!terminal) return;
		return installCopyOnSelect(terminal, () =>
			copiedIndicatorStore.notify(terminalInstanceId),
		);
	}, [terminalId, terminalInstanceId, connectionState, copyOnSelect]);
}
