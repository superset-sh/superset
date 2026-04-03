import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/** Cross-workspace moves temporarily remove a paneId then re-add it. Wait before disposing. */
const DISPOSE_DELAY_MS = 500;

function extractTerminalPaneIds(rows: { paneLayout: unknown }[]): Set<string> {
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

		for (const paneId of currentPaneIds) {
			const timer = pendingDisposals.current.get(paneId);
			if (timer) {
				clearTimeout(timer);
				pendingDisposals.current.delete(paneId);
			}
		}

		for (const paneId of prevPaneIds) {
			if (currentPaneIds.has(paneId)) continue;
			if (pendingDisposals.current.has(paneId)) continue;

			const timer = setTimeout(() => {
				pendingDisposals.current.delete(paneId);

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

	useEffect(() => {
		return () => {
			for (const timer of pendingDisposals.current.values()) {
				clearTimeout(timer);
			}
			pendingDisposals.current.clear();
		};
	}, []);
}
