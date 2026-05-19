import type { WorkspaceStore } from "@superset/panes";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData, TerminalPaneData } from "../../../../types";
import type { TerminalLauncher } from "../../../useV2TerminalLauncher";

export function createAddTerminalAction({
	store,
	launcher,
}: {
	store: StoreApi<WorkspaceStore<PaneViewerData>>;
	launcher: TerminalLauncher;
}): () => Promise<void> {
	// Dedupe concurrent calls: `launcher.create()` waits for the OSC 133
	// shell-ready marker (up to 15s). Without this guard, a user clicking
	// "Add Terminal" multiple times during that window queues up multiple
	// creates and multiple tabs appear at once when the first resolves.
	let inFlight: Promise<void> | null = null;
	return () => {
		if (inFlight) return inFlight;
		inFlight = (async () => {
			try {
				const terminalId = await launcher.create();
				store.getState().addTab({
					panes: [
						{
							kind: "terminal",
							data: { terminalId } as TerminalPaneData,
						},
					],
				});
			} finally {
				inFlight = null;
			}
		})();
		return inFlight;
	};
}
