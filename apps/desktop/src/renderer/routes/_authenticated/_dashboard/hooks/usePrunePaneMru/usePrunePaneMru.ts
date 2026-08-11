import { useLiveQuery } from "@tanstack/react-db";
import { useEffect } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { usePaneMruStore } from "renderer/stores/pane-mru";
import { collectOpenPaneIds } from "./collectOpenPaneIds";

/**
 * Drops MRU entries whose pane no longer exists.
 *
 * Mounted at the dashboard level, because it needs every workspace's
 * persisted layout — not just the one currently routed. This is also how
 * closed panes leave the list: closing a pane rewrites that workspace's
 * layout, the live query re-fires, and the pane is pruned.
 */
export function usePrunePaneMru() {
	const collections = useCollections();
	const pruneToOpenPanes = usePaneMruStore((state) => state.pruneToOpenPanes);

	const { data: workspaceRows = [], isReady } = useLiveQuery(
		(query) =>
			query.from({
				v2WorkspaceLocalState: collections.v2WorkspaceLocalState,
			}),
		[collections],
	);

	useEffect(() => {
		// Pruning is a write, so it waits for strict readiness. Running it
		// against a partially-hydrated collection would read "no panes" for
		// workspaces that simply have not loaded and delete good entries.
		if (!isReady) return;
		pruneToOpenPanes(collectOpenPaneIds(workspaceRows));
	}, [isReady, workspaceRows, pruneToOpenPanes]);
}
