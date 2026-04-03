import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

/**
 * Cross-workspace moves temporarily remove a terminalId then re-add it.
 * Wait before detaching the renderer runtime.
 */
const DETACH_DELAY_MS = 500;

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
 * When a terminal pane is removed from workspace state, the renderer runtime
 * (xterm + DOM wrapper) is detached but NOT disposed. The terminal session
 * in host-service stays alive independently — pane removal does not kill
 * the terminal. Only an explicit dispose action (e.g. user kills terminal)
 * should call terminalRuntimeRegistry.dispose().
 */
export function useGlobalTerminalLifecycle() {
	const collections = useCollections();
	const prevTerminalIdsRef = useRef<Set<string>>(new Set());
	const pendingDetaches = useRef<Map<string, ReturnType<typeof setTimeout>>>(
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

		// Cancel pending detach for terminals that reappeared (cross-workspace move)
		for (const terminalId of currentTerminalIds) {
			const timer = pendingDetaches.current.get(terminalId);
			if (timer) {
				clearTimeout(timer);
				pendingDetaches.current.delete(terminalId);
			}
		}

		// Schedule detach (not dispose) for terminals whose pane was removed
		for (const terminalId of prevTerminalIds) {
			if (currentTerminalIds.has(terminalId)) continue;
			if (pendingDetaches.current.has(terminalId)) continue;

			const timer = setTimeout(() => {
				pendingDetaches.current.delete(terminalId);

				const freshRows = Array.from(
					collections.v2WorkspaceLocalState.state.values(),
				);
				const freshIds = extractTerminalIds(freshRows);

				if (!freshIds.has(terminalId)) {
					// Detach renderer runtime only — terminal session stays alive
					// in host-service. The xterm instance and DOM wrapper are kept
					// so a future pane can reattach without losing scrollback.
					terminalRuntimeRegistry.detach(terminalId);
				}
			}, DETACH_DELAY_MS);

			pendingDetaches.current.set(terminalId, timer);
		}

		prevTerminalIdsRef.current = currentTerminalIds;
	}, [allWorkspaceRows, collections]);

	useEffect(() => {
		return () => {
			for (const timer of pendingDetaches.current.values()) {
				clearTimeout(timer);
			}
			pendingDetaches.current.clear();
		};
	}, []);
}
