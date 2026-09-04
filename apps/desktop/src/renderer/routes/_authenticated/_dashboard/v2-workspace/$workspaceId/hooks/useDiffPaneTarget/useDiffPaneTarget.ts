import type { WorkspaceStore } from "@superset/panes";
import { useEffect, useState } from "react";
import { useStore } from "zustand";
import type { StoreApi } from "zustand/vanilla";
import type { DiffPaneData, PaneViewerData } from "../../types";

export interface DiffPaneTarget {
	/** Worktree-relative path of the file the diff pane last navigated to. */
	path: string;
	changeKey?: string;
}

/**
 * The focused diff pane's navigation target, held while focus moves to a
 * terminal or file pane so the sidebar's Changes tab keeps highlighting the
 * diff the user was reading, and cleared once no diff pane is open anywhere.
 */
export function useDiffPaneTarget(
	store: StoreApi<WorkspaceStore<PaneViewerData>>,
): DiffPaneTarget | undefined {
	// Primitive selectors — an object selector would re-render on every store
	// write. A fresh Changes pane carries an empty path until its first
	// navigation, which is no target yet.
	const activeKind = useStore(
		store,
		(state) => state.getActivePane()?.pane.kind,
	);
	const activePath = useStore(store, (state) => {
		const active = state.getActivePane();
		if (active?.pane.kind !== "diff") return undefined;
		return (active.pane.data as DiffPaneData).path || undefined;
	});
	const activeChangeKey = useStore(store, (state) => {
		const active = state.getActivePane();
		if (active?.pane.kind !== "diff") return undefined;
		return (active.pane.data as DiffPaneData).changeKey;
	});
	const hasDiffPane = useStore(store, (state) =>
		state.tabs.some((tab) =>
			Object.values(tab.panes).some((pane) => pane.kind === "diff"),
		),
	);

	const [target, setTarget] = useState<DiffPaneTarget | undefined>(undefined);
	// Only a focused diff pane speaks for the target: it sets one when it
	// navigates and clears one when it releases its path (collapse-all does),
	// while focus on a terminal or file pane leaves the last target standing.
	useEffect(() => {
		if (activeKind !== "diff") return;
		setTarget(
			activePath ? { path: activePath, changeKey: activeChangeKey } : undefined,
		);
	}, [activeKind, activePath, activeChangeKey]);
	useEffect(() => {
		if (!hasDiffPane) setTarget(undefined);
	}, [hasDiffPane]);
	return target;
}
