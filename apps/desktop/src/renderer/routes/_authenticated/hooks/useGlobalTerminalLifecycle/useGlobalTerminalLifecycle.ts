import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useCollections } from "../../providers/CollectionsProvider";

/** Delay before confirming a pane removal is permanent (handles cross-workspace moves). */
const DISPOSE_DELAY_MS = 500;

function extractTerminalPaneIds(
	rows: { paneLayout: unknown }[],
): Set<string> {
	const ids = new Set<string>();
	for (const row of rows) {
		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!layout?.tabs) continue;
		for (const tab of layout.tabs) {
			for (const [paneId, pane] of Object.entries(tab.panes)) {
				if (pane.kind === "terminal") {
					ids.add(paneId);
				}
			}
		}
	}
	return ids;
}

/**
 * Global hook that watches all persisted workspace layouts and disposes
 * terminal runtimes only when their paneId disappears from every workspace.
 *
 * Must be mounted once, inside CollectionsProvider, above workspace routes.
 */
export function useGlobalTerminalLifecycle() {
	const collections = useCollections();
	const prevPaneIdsRef = useRef<Set<string>>(new Set());
	const pendingDisposals = useRef<Map<string, ReturnType<typeof setTimeout>>>(
		new Map(),
	);

	const { data: allWorkspaceRows = [] } = useLiveQuery(
		(query) =>
			query.from({
				v2WorkspaceLocalState: collections.v2WorkspaceLocalState,
			}),
		[collections],
	);

	useEffect(() => {
		const currentPaneIds = extractTerminalPaneIds(allWorkspaceRows);
		const prevPaneIds = prevPaneIdsRef.current;

		// Cancel pending disposals for paneIds that reappeared (cross-workspace move completed)
		for (const paneId of currentPaneIds) {
			const timer = pendingDisposals.current.get(paneId);
			if (timer) {
				clearTimeout(timer);
				pendingDisposals.current.delete(paneId);
			}
		}

		// Find paneIds that disappeared
		for (const paneId of prevPaneIds) {
			if (currentPaneIds.has(paneId)) continue;
			if (pendingDisposals.current.has(paneId)) continue;

			// Schedule disposal with delay to handle atomic cross-workspace moves
			const timer = setTimeout(() => {
				pendingDisposals.current.delete(paneId);

				// Re-read current global state to confirm the pane is still gone
				const freshRows = Array.from(
					collections.v2WorkspaceLocalState.state.values(),
				);
				const freshIds = extractTerminalPaneIds(freshRows);

				if (!freshIds.has(paneId)) {
					terminalRuntimeRegistry.dispose(paneId);
				}
			}, DISPOSE_DELAY_MS);

			pendingDisposals.current.set(paneId, timer);
		}

		prevPaneIdsRef.current = currentPaneIds;
	}, [allWorkspaceRows, collections]);

	// Cleanup pending timers on unmount
	useEffect(() => {
		return () => {
			for (const timer of pendingDisposals.current.values()) {
				clearTimeout(timer);
			}
			pendingDisposals.current.clear();
		};
	}, []);
}
