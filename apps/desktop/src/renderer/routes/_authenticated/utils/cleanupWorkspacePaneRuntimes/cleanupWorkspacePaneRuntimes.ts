import type { Pane } from "@superset/panes";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import {
	extractPaneIds,
	type PaneLifecycleRow,
} from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";
import { getTerminalRuntimeInstances } from "./getTerminalRuntimeInstances";

function getBrowserRuntimeId(pane: Pane<unknown>): string | null {
	return pane.kind === "browser" ? pane.id : null;
}

export function cleanupWorkspacePaneRuntimes(rows: PaneLifecycleRow[]): void {
	for (const [paneId, terminalId] of getTerminalRuntimeInstances(rows)) {
		terminalRuntimeRegistry.release(terminalId, paneId);
	}
	for (const row of rows) {
		if (typeof row.workspaceId !== "string") continue;
		for (const browserId of extractPaneIds([row], getBrowserRuntimeId)) {
			browserRuntimeRegistry.destroy(browserId, row.workspaceId);
		}
	}
}
