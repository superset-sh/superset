import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/** Grace period for cross-workspace pane moves before disposing. */
const DISPOSE_DELAY_MS = 500;

interface TerminalPaneData {
	terminalId: string;
}

function extractTerminalIds(rows: { paneLayout: unknown }[]): Set<string> {
	const ids = new Set<string>();
	for (const row of rows) {
		const layout = row.paneLayout as WorkspaceState<unknown> | undefined;
		if (!layout?.tabs) continue;
		for (const tab of layout.tabs) {
			for (const pane of Object.values(tab.panes)) {
				if (pane.kind === "terminal") {
					const data = pane.data as TerminalPaneData;
					if (data.terminalId) {
						ids.add(data.terminalId);
					}
				}
			}
		}
	}
	return ids;
}

export function useGlobalTerminalLifecycle() {
	const collections = useCollections();
	const prevTerminalIdsRef = useRef<Set<string>>(new Set());
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
		const currentTerminalIds = extractTerminalIds(allWorkspaceRows);
		const prevTerminalIds = prevTerminalIdsRef.current;

		for (const terminalId of currentTerminalIds) {
			const timer = pendingDisposals.current.get(terminalId);
			if (timer) {
				clearTimeout(timer);
				pendingDisposals.current.delete(terminalId);
			}
		}

		for (const terminalId of prevTerminalIds) {
			if (currentTerminalIds.has(terminalId)) continue;
			if (pendingDisposals.current.has(terminalId)) continue;

			const timer = setTimeout(() => {
				pendingDisposals.current.delete(terminalId);

				const freshRows = Array.from(
					collections.v2WorkspaceLocalState.state.values(),
				);
				const freshIds = extractTerminalIds(freshRows);

				if (!freshIds.has(terminalId)) {
					terminalRuntimeRegistry.dispose(terminalId);
				}
			}, DISPOSE_DELAY_MS);

			pendingDisposals.current.set(terminalId, timer);
		}

		prevTerminalIdsRef.current = currentTerminalIds;
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
