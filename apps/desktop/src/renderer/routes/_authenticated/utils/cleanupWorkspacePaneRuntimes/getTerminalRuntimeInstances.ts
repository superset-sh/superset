import type { WorkspaceState } from "@superset/panes";
import type { PaneLifecycleRow } from "renderer/routes/_authenticated/components/utils/paneLifecycleRows";

export function getTerminalRuntimeInstances(rows: PaneLifecycleRow[]) {
	const instances: [paneId: string, terminalId: string][] = [];
	for (const row of rows) {
		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		for (const tab of layout?.tabs ?? []) {
			for (const pane of Object.values(tab.panes)) {
				if (
					pane.kind !== "terminal" ||
					!pane.data ||
					typeof pane.data !== "object"
				)
					continue;
				const data = pane.data as { terminalId?: unknown };
				if (typeof data.terminalId === "string")
					instances.push([pane.id, data.terminalId]);
			}
		}
	}
	return instances;
}
