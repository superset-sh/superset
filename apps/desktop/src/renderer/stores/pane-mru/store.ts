import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";
import { pruneToOpenPanes, recordFocus } from "./paneMru";
import type { PaneMruEntry } from "./types";

interface PaneMruState {
	/** Newest-first. Spans every tab, pane, and workspace. */
	entries: PaneMruEntry[];
	/** Move a pane to the front of the list, or insert it if new. */
	recordFocus: (entry: PaneMruEntry) => void;
	/**
	 * Drop panes that no longer exist. Workspaces absent from the map are left
	 * alone — see `pruneToOpenPanes` for why that guard matters.
	 *
	 * This is the only removal path: closing a pane rewrites its workspace's
	 * persisted layout, which the prune picks up. No explicit "remove these
	 * panes" call is needed.
	 */
	pruneToOpenPanes: (openPaneIdsByWorkspace: Map<string, Set<string>>) => void;
}

export const usePaneMruStore = create<PaneMruState>()(
	devtools(
		persist(
			(set) => ({
				entries: [],

				recordFocus: (entry) =>
					set((state) => ({
						entries: recordFocus({ entries: state.entries, entry }),
					})),

				pruneToOpenPanes: (openPaneIdsByWorkspace) =>
					set((state) => ({
						entries: pruneToOpenPanes({
							entries: state.entries,
							openPaneIdsByWorkspace,
						}),
					})),
			}),
			{
				name: "pane-mru-storage",
				version: 1,
				// Only the list is durable. Cycling state is transient by design and
				// must never reach disk.
				partialize: (state) => ({ entries: state.entries }),
				// Recency history is a convenience, not data worth migrating. Any
				// future shape change resets to empty rather than risking a
				// half-translated entry reaching the overlay.
				migrate: () => ({ entries: [] }),
			},
		),
		{ name: "pane-mru" },
	),
);
