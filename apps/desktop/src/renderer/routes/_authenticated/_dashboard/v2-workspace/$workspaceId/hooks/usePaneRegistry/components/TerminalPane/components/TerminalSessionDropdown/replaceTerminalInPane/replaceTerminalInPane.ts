import type { WorkspaceStore } from "@superset/panes";
import { markTerminalForBackground } from "renderer/lib/terminal/terminal-background-intents";
import type {
	PaneViewerData,
	TerminalPaneData,
} from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/types";

interface ReplaceTerminalInPaneOptions {
	state: WorkspaceStore<PaneViewerData>;
	tabId: string;
	paneId: string;
	currentTerminalId: string;
	nextTerminalId: string;
}

// Counts panes (other than `excludePaneId`) currently displaying `terminalId`.
function countTerminalPaneLocations(
	state: WorkspaceStore<PaneViewerData>,
	terminalId: string,
	excludePaneId: string,
): number {
	let count = 0;
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.id === excludePaneId || pane.kind !== "terminal") continue;
			const data = pane.data as Partial<TerminalPaneData>;
			if (data.terminalId === terminalId) count += 1;
		}
	}
	return count;
}

// Switches the pane's terminalId in place and ensures the pane becomes the
// active pane in its tab so keyboard focus follows the new terminal.
//
// Without setActivePane(), creating a new terminal from a non-active pane's
// dropdown leaves the pane inactive — the user has to click on the terminal
// before they can type. Reported in #4131.
export function replaceTerminalInPane({
	state,
	tabId,
	paneId,
	currentTerminalId,
	nextTerminalId,
}: ReplaceTerminalInPaneOptions): void {
	if (countTerminalPaneLocations(state, currentTerminalId, paneId) === 0) {
		markTerminalForBackground(currentTerminalId);
	}

	state.setPaneData({
		paneId,
		data: { terminalId: nextTerminalId } as PaneViewerData,
	});
	state.setPaneTitleOverride({
		tabId,
		paneId,
		titleOverride: undefined,
	});
	state.setActivePane({ tabId, paneId });
}
