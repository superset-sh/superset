import type { WorkspaceState } from "@superset/panes";

/**
 * Build the "which panes still exist" map that `pruneToOpenPanes` consumes,
 * from the persisted pane layout of every workspace.
 *
 * A workspace only appears in the result when its layout is readable. A
 * missing or malformed layout leaves it out entirely, which the prune reads
 * as "unknown, leave its entries alone" rather than "it has no panes".
 */
export function collectOpenPaneIds(
	rows: { workspaceId?: unknown; paneLayout?: unknown }[],
): Map<string, Set<string>> {
	const result = new Map<string, Set<string>>();

	for (const row of rows) {
		const { workspaceId } = row;
		if (typeof workspaceId !== "string" || !workspaceId) continue;

		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!layout || !Array.isArray(layout.tabs)) continue;

		const paneIds = new Set<string>();
		for (const tab of layout.tabs) {
			if (!tab?.panes) continue;
			for (const paneId of Object.keys(tab.panes)) paneIds.add(paneId);
		}
		result.set(workspaceId, paneIds);
	}

	return result;
}
