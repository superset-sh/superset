import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
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
	}, [collections, store, workspaceId]);

	return { store };
}
