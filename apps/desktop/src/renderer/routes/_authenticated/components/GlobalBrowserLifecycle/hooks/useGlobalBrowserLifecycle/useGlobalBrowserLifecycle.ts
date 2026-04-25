import type { WorkspaceState } from "@superset/panes";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useRef } from "react";
import { browserRuntimeRegistry } from "renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/hooks/usePaneRegistry/components/BrowserPane/browserRuntimeRegistry";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	extractPaneLocations,
	extractWorkspaceIds,
	getRemovedPaneLocations,
	type PaneLifecycleRow,
} from "../../../utils/paneLifecycleRows";

/**
 * Grace period for cross-workspace pane moves / renames before destroying.
 * Matches the terminal-side timing so the two runtimes behave consistently.
 */
const DESTROY_DELAY_MS = 500;

interface PendingBrowserDestruction {
	workspaceId: string;
	timer: ReturnType<typeof setTimeout> | null;
}

function getBrowserPaneId(
	pane: WorkspaceState<unknown>["tabs"][number]["panes"][string],
): string | null {
	return pane.kind === "browser" ? pane.id : null;
}

function extractBrowserLocations(
	rows: PaneLifecycleRow[],
): Map<string, string> {
	return extractPaneLocations(rows, getBrowserPaneId);
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
	const prevBrowserLocationsRef = useRef<Map<string, string>>(new Map());
	const pendingDestruction = useRef<Map<string, PendingBrowserDestruction>>(
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
		const currentBrowserLocations = extractBrowserLocations(rows);
		const currentWorkspaceIds = extractWorkspaceIds(rows);
		const prevBrowserLocations = prevBrowserLocationsRef.current;

		// Cancel any pending destruction for ids that reappeared (e.g. pane
		// moved between workspaces, user undo, or the transient replaceState
		// churn we were fighting in the first place).
		for (const browserId of currentBrowserLocations.keys()) {
			const pending = pendingDestruction.current.get(browserId);
			if (pending?.timer) {
				clearTimeout(pending.timer);
			}
			pendingDestruction.current.delete(browserId);
		}

		// If a pane was authoritatively removed but the owner row disappeared
		// before the grace timer fired, keep waiting until that row is present
		// again. That avoids destroying webviews during sleep/wake while still
		// cleaning up when the post-removal layout comes back.
		for (const [browserId, pending] of pendingDestruction.current) {
			if (pending.timer) continue;
			if (currentWorkspaceIds.has(pending.workspaceId)) {
				pendingDestruction.current.delete(browserId);
				browserRuntimeRegistry.destroy(browserId);
			}
		}

		const removedLocations = getRemovedPaneLocations({
			previousLocations: prevBrowserLocations,
			currentLocations: currentBrowserLocations,
			currentWorkspaceIds,
		});

		for (const { id: browserId, workspaceId } of removedLocations) {
			if (pendingDestruction.current.has(browserId)) continue;

			const timer = setTimeout(() => {
				const freshRows = Array.from(
					collections.v2WorkspaceLocalState.state.values(),
				) as PaneLifecycleRow[];
				const freshLocations = extractBrowserLocations(freshRows);
				const freshWorkspaceIds = extractWorkspaceIds(freshRows);

				if (freshLocations.has(browserId)) {
					pendingDestruction.current.delete(browserId);
					return;
				}

				if (freshWorkspaceIds.has(workspaceId)) {
					pendingDestruction.current.delete(browserId);
					browserRuntimeRegistry.destroy(browserId);
					return;
				}

				const pending = pendingDestruction.current.get(browserId);
				if (pending) {
					pending.timer = null;
				}
			}, DESTROY_DELAY_MS);

			pendingDestruction.current.set(browserId, { workspaceId, timer });
		}

		prevBrowserLocationsRef.current = currentBrowserLocations;
	}, [allWorkspaceRows, collections]);

	useEffect(() => {
		return () => {
			for (const pending of pendingDestruction.current.values()) {
				if (pending.timer) {
					clearTimeout(pending.timer);
				}
			}
			pendingDestruction.current.clear();
		};
	}, []);
}
