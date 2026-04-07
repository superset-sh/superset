import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useV2PaneStatusStore } from "renderer/stores/v2-pane-status";
import type { PaneViewerData } from "../../types";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

function getSnapshot(state: WorkspaceState<PaneViewerData>): string {
	return JSON.stringify(state);
}

interface UseV2WorkspacePaneLayoutParams {
	projectId: string;
	workspaceId: string;
}

export function useV2WorkspacePaneLayout({
	projectId,
	workspaceId,
}: UseV2WorkspacePaneLayoutParams) {
	const collections = useCollections();
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	const [store] = useState(() =>
		createWorkspaceStore<PaneViewerData>({
			initialState: EMPTY_STATE,
		}),
	);
	const lastSyncedSnapshotRef = useRef(getSnapshot(EMPTY_STATE));

	const { data: localWorkspaceRows = [] } = useLiveQuery(
		(query) =>
			query
				.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
				.where(({ v2WorkspaceLocalState }) =>
					eq(v2WorkspaceLocalState.workspaceId, workspaceId),
				),
		[collections, workspaceId],
	);
	const localWorkspaceState = localWorkspaceRows[0] ?? null;
	const persistedPaneLayout = useMemo(
		() =>
			(localWorkspaceState?.paneLayout as
				| WorkspaceState<PaneViewerData>
				| undefined) ?? EMPTY_STATE,
		[localWorkspaceState],
	);

	useEffect(() => {
		ensureWorkspaceInSidebar(workspaceId, projectId);
	}, [ensureWorkspaceInSidebar, projectId, workspaceId]);

	useEffect(() => {
		const nextSnapshot = getSnapshot(persistedPaneLayout);
		if (nextSnapshot === lastSyncedSnapshotRef.current) {
			return;
		}

		lastSyncedSnapshotRef.current = nextSnapshot;
		store.getState().replaceState(persistedPaneLayout);
	}, [persistedPaneLayout, store]);

	useEffect(() => {
		const unsubscribe = store.subscribe((nextStore) => {
			const nextSnapshot = getSnapshot({
				version: nextStore.version,
				tabs: nextStore.tabs,
				activeTabId: nextStore.activeTabId,
			});
			if (nextSnapshot === lastSyncedSnapshotRef.current) {
				return;
			}

			ensureWorkspaceInSidebar(workspaceId, projectId);
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
				return;
			}

			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.paneLayout = {
					version: nextStore.version,
					tabs: nextStore.tabs,
					activeTabId: nextStore.activeTabId,
				};
			});
			lastSyncedSnapshotRef.current = nextSnapshot;
		});

		return () => {
			unsubscribe();
		};
	}, [collections, ensureWorkspaceInSidebar, projectId, store, workspaceId]);

	// Sync pane IDs into the v2 pane status store for notification indicators.
	// We intentionally do NOT unregister on unmount — pane entries must persist
	// so the global listener and sidebar can process events when navigated away.
	useEffect(() => {
		const extractPaneIds = () =>
			store.getState().tabs.flatMap((tab) => Object.keys(tab.panes));

		useV2PaneStatusStore.getState().registerPanes(workspaceId, extractPaneIds());

		const unsubscribe = store.subscribe(() => {
			useV2PaneStatusStore
				.getState()
				.registerPanes(workspaceId, extractPaneIds());
		});

		return () => {
			unsubscribe();
		};
	}, [store, workspaceId]);

	return {
		localWorkspaceState,
		store,
	};
}
