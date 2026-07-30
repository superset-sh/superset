import type { Tab } from "@superset/panes";
import type { PaneViewerData, TerminalPaneData } from "../../../../../../types";
import { TerminalPaneIcon } from "./TerminalPaneIcon";

function getSingleTerminalPane(
	tab: Tab<PaneViewerData>,
): { terminalId: string } | null {
	const paneIds = Object.keys(tab.panes);
	if (paneIds.length !== 1) return null;
	const pane = tab.panes[paneIds[0]];
	if (pane.kind !== "terminal") return null;
	return { terminalId: (pane.data as TerminalPaneData).terminalId };
}

/**
 * Tab-bar icon for single-pane terminal tabs — same icon + agent-color dot
 * as the pane's own icon (`TerminalPaneIcon`), so the always-visible tab
 * carries the same signal as the in-pane one. Multi-pane tabs get no icon,
 * matching `renderBrowserTabIcon`'s single-pane-only behavior.
 */
export function createRenderTerminalTabIcon(workspaceId: string) {
	return function renderTerminalTabIcon(tab: Tab<PaneViewerData>) {
		const terminal = getSingleTerminalPane(tab);
		if (!terminal) return null;
		return (
			<TerminalPaneIcon
				workspaceId={workspaceId}
				terminalId={terminal.terminalId}
			/>
		);
	};
}
