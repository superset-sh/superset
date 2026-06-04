import type { Pane } from "@superset/panes";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import type { PaneViewerData, TerminalPaneData } from "../types";

function getActiveTerminalPanes(panes: Iterable<Pane<PaneViewerData>>) {
	return Array.from(panes).filter((pane) => {
		if (pane.kind !== "terminal") return false;
		const { terminalId } = pane.data as TerminalPaneData;
		if (!terminalId) return false;
		return (
			terminalRuntimeRegistry.getConnectionState(terminalId, pane.id) === "open"
		);
	});
}

export function confirmCloseActiveTerminalPanes(
	panes: Iterable<Pane<PaneViewerData>>,
): boolean {
	const activeTerminalPanes = getActiveTerminalPanes(panes);
	if (activeTerminalPanes.length === 0) return true;

	const message =
		activeTerminalPanes.length === 1
			? "Close active terminal session?\n\nThis will stop the terminal session and may lose an in-progress agent run."
			: `Close ${activeTerminalPanes.length} active terminal sessions?\n\nThis will stop these terminal sessions and may lose in-progress agent runs.`;

	return window.confirm(message);
}
