import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Grace period for cross-workspace pane moves / renames before destroying.
 * Matches the terminal-side timing so the two runtimes behave consistently.
 */
const DESTROY_DELAY_MS = 500;

function extractBrowserPaneIds(rows: { paneLayout: unknown }[]): Set<string> {
	const ids = new Set<string>();
	for (const row of rows) {
		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!layout?.tabs) continue;
		for (const tab of layout.tabs) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind === "browser") {
					ids.add(pane.id);
				}
			}
		}
	}
	return ids;
}

/**
 * Global sweeper that destroys browser registry entries whose paneId is no
 * longer present in ANY workspace's persisted layout. Replaces the Panes
 * library's `onRemoved` hook for browsers — `onRemoved` fires on transient
 * "missing from previous render" diffs during v2 workspace switches (the
 * provider key doesn't always remount promptly, so the pane store gets
 * `replaceState`'d in place and the diff looks like a removal), which
 * prematurely tore down webviews. Comparing against the persisted store is
 * authoritative.
 *
 * Mirrors useGlobalTerminalLifecycle by design.
 */
export function useGlobalBrowserLifecycle() {
	const collections = useCollections();
	const prevBrowserIdsRef = useRef<Set<string>>(new Set());
	const pendingDestruction = useRef<Map<string, ReturnType<typeof setTimeout>>>(
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
		const currentBrowserIds = extractBrowserPaneIds(allWorkspaceRows);
		const prevBrowserIds = prevBrowserIdsRef.current;

		// Cancel any pending destruction for ids that reappeared (e.g. pane
		// moved between workspaces, user undo, or the transient replaceState
		// churn we were fighting in the first place).
		for (const browserId of currentBrowserIds) {
			const timer = pendingDestruction.current.get(browserId);
			if (timer) {
				clearTimeout(timer);
				pendingDestruction.current.delete(browserId);
			}
		}

		for (const browserId of prevBrowserIds) {
			if (currentBrowserIds.has(browserId)) continue;
			if (pendingDestruction.current.has(browserId)) continue;

			const timer = setTimeout(() => {
				pendingDestruction.current.delete(browserId);

				const freshRows = Array.from(
					collections.v2WorkspaceLocalState.state.values(),
				);
				const freshIds = extractBrowserPaneIds(freshRows);

				if (!freshIds.has(browserId)) {
					browserRuntimeRegistry.destroy(browserId);
				}
			}, DESTROY_DELAY_MS);

			pendingDestruction.current.set(browserId, timer);
		}

		prevBrowserIdsRef.current = currentBrowserIds;
	}, [allWorkspaceRows, collections]);

	useEffect(() => {
		return () => {
			for (const timer of pendingDestruction.current.values()) {
				clearTimeout(timer);
			}
			pendingDestruction.current.clear();
		};
	}, []);
}
