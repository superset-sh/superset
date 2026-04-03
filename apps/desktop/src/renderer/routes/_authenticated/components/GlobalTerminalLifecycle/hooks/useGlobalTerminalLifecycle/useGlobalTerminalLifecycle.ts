import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Cross-workspace moves temporarily remove a terminalId then re-add it.
 * Wait before disposing the renderer runtime.
 */
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

/**
 * Manages renderer-side terminal runtime lifecycle.
 *
 * terminalId is the session key (independent of paneId). When no pane
 * references a given terminalId, the renderer runtime AND the host-service
 * session are disposed. The identity split means terminals *could* outlive
 * panes (e.g. for a future "reattach" UI), but the default policy for this
 * cut is dispose-on-unreferenced to avoid leaking hidden sessions.
 */
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

		// Cancel pending dispose for terminals that reappeared (cross-workspace move)
		for (const terminalId of currentTerminalIds) {
			const timer = pendingDisposals.current.get(terminalId);
			if (timer) {
				clearTimeout(timer);
				pendingDisposals.current.delete(terminalId);
			}
		}

		// Schedule dispose for terminals whose last pane reference was removed
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
					// Dispose renderer runtime (xterm + transport) and send dispose
					// to host-service which kills the PTY and marks the DB row.
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
