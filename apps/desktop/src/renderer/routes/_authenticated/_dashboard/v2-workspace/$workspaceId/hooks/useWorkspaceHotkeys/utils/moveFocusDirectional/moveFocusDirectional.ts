import {
	type FocusDirection,
	getSpatialNeighborPaneId,
	type WorkspaceStore,
} from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";

/**
 * Moves keyboard focus to a directional neighbor pane.
 *
 * `setActivePane` only updates the visual active-pane highlight in Zustand
 * state — it does not move DOM/keyboard focus onto the target terminal's xterm
 * instance. To make `FOCUS_PANE_*` shortcuts actually let the user type into
 * the neighbor terminal, we must also call `.focus()` on its runtime, which is
 * what `focusTerminal` does. The focuser is injected so this stays testable
 * without the terminal runtime registry / DOM.
 */
export interface PaneTerminalFocuser {
	focusTerminal(terminalId: string, terminalInstanceId: string): void;
}

export function moveFocusDirectional(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
	dir: FocusDirection,
	focuser: PaneTerminalFocuser,
): void {
	const state = store.getState();
	const tab = state.getActiveTab();
	if (!tab || !tab.activePaneId) return;

	const neighbor = getSpatialNeighborPaneId(tab.layout, tab.activePaneId, dir);
	if (!neighbor) return;

	state.setActivePane({ tabId: tab.id, paneId: neighbor });

	const pane = tab.panes[neighbor];
	if (pane?.kind === "terminal") {
		const { terminalId } = pane.data as TerminalPaneData;
		focuser.focusTerminal(terminalId, pane.id);
	}
}
