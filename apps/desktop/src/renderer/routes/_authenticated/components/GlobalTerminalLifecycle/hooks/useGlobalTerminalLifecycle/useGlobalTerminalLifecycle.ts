import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { terminalRuntimeRegistry } from "renderer/lib/terminal/terminal-runtime-registry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	extractPaneLocations,
	extractWorkspaceIds,
	getRemovedPaneLocations,
	type PaneLifecycleRow,
} from "../../../utils/paneLifecycleRows";

/** Grace period for cross-workspace pane moves before releasing renderer state. */
const RELEASE_DELAY_MS = 500;

interface TerminalPaneData {
	terminalId: string;
}

interface PendingTerminalRelease {
	workspaceId: string;
	timer: ReturnType<typeof setTimeout> | null;
}

function getTerminalId(
	pane: WorkspaceState<unknown>["tabs"][number]["panes"][string],
): string | null {
	if (pane.kind !== "terminal") return null;
	if (!pane.data || typeof pane.data !== "object") return null;
	const data = pane.data as Partial<TerminalPaneData>;
	return typeof data.terminalId === "string" ? data.terminalId : null;
}

function extractTerminalLocations(
	rows: PaneLifecycleRow[],
): Map<string, string> {
	return extractPaneLocations(rows, getTerminalId);
}

export function useGlobalTerminalLifecycle() {
	const collections = useCollections();
	const prevTerminalLocationsRef = useRef<Map<string, string>>(new Map());
	const pendingReleases = useRef<Map<string, PendingTerminalRelease>>(
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
		const rows = allWorkspaceRows as PaneLifecycleRow[];
		const currentTerminalLocations = extractTerminalLocations(rows);
		const currentWorkspaceIds = extractWorkspaceIds(rows);
		const prevTerminalLocations = prevTerminalLocationsRef.current;

		for (const terminalId of currentTerminalLocations.keys()) {
			const pending = pendingReleases.current.get(terminalId);
			if (pending?.timer) {
				clearTimeout(pending.timer);
			}
			pendingReleases.current.delete(terminalId);
		}

		// If a pane was authoritatively removed but the owner row disappeared
		// before the grace timer fired, keep waiting until that row is present
		// again. That avoids releasing active renderer state during sleep/wake
		// while still cleaning up when the post-removal layout comes back.
		for (const [terminalId, pending] of pendingReleases.current) {
			if (pending.timer) continue;
			if (currentWorkspaceIds.has(pending.workspaceId)) {
				pendingReleases.current.delete(terminalId);
				terminalRuntimeRegistry.release(terminalId);
			}
		}

		const removedLocations = getRemovedPaneLocations({
			previousLocations: prevTerminalLocations,
			currentLocations: currentTerminalLocations,
			currentWorkspaceIds,
		});

		for (const { id: terminalId, workspaceId } of removedLocations) {
			if (pendingReleases.current.has(terminalId)) continue;

			const timer = setTimeout(() => {
				const freshRows = Array.from(
					collections.v2WorkspaceLocalState.state.values(),
				) as PaneLifecycleRow[];
				const freshLocations = extractTerminalLocations(freshRows);
				const freshWorkspaceIds = extractWorkspaceIds(freshRows);

				if (freshLocations.has(terminalId)) {
					pendingReleases.current.delete(terminalId);
					return;
				}

				if (freshWorkspaceIds.has(workspaceId)) {
					pendingReleases.current.delete(terminalId);
					terminalRuntimeRegistry.release(terminalId);
					return;
				}

				const pending = pendingReleases.current.get(terminalId);
				if (pending) {
					pending.timer = null;
				}
			}, RELEASE_DELAY_MS);

			pendingReleases.current.set(terminalId, { workspaceId, timer });
		}

		prevTerminalLocationsRef.current = currentTerminalLocations;
	}, [allWorkspaceRows, collections]);

	useEffect(() => {
		return () => {
			for (const pending of pendingReleases.current.values()) {
				if (pending.timer) {
					clearTimeout(pending.timer);
				}
			}
			pendingReleases.current.clear();
		};
	}, []);
}
