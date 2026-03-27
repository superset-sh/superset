import {
	createPaneWorkspaceState,
	createPaneWorkspaceStore,
	type PaneWorkspaceState,
} from "@superset/pane-layout";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { PaneViewerData } from "../../pane-viewer.model";

const EMPTY_PANE_LAYOUT = createPaneWorkspaceState<PaneViewerData>({
	roots: [],
});

function getPaneLayoutSnapshot(
	state: PaneWorkspaceState<PaneViewerData>,
): string {
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
		createPaneWorkspaceStore<PaneViewerData>({
			initialState: EMPTY_PANE_LAYOUT,
		}),
	);
	const lastSyncedSnapshotRef = useRef(
		getPaneLayoutSnapshot(EMPTY_PANE_LAYOUT),
	);

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
				| PaneWorkspaceState<PaneViewerData>
				| undefined) ?? EMPTY_PANE_LAYOUT,
		[localWorkspaceState],
	);

	useEffect(() => {
		ensureWorkspaceInSidebar(workspaceId, projectId);
	}, [ensureWorkspaceInSidebar, projectId, workspaceId]);

	useEffect(() => {
		const nextSnapshot = getPaneLayoutSnapshot(persistedPaneLayout);
		if (nextSnapshot === lastSyncedSnapshotRef.current) {
			return;
		}

		lastSyncedSnapshotRef.current = nextSnapshot;
		store.getState().replaceState(persistedPaneLayout);
	}, [persistedPaneLayout, store]);

	useEffect(() => {
		const unsubscribe = store.subscribe((nextStore) => {
			const nextSnapshot = getPaneLayoutSnapshot(nextStore.state);
			if (nextSnapshot === lastSyncedSnapshotRef.current) {
				return;
			}

			ensureWorkspaceInSidebar(workspaceId, projectId);
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
				return;
			}

			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.paneLayout = nextStore.state;
			});
			lastSyncedSnapshotRef.current = nextSnapshot;
		});

		return () => {
			unsubscribe();
		};
	}, [collections, ensureWorkspaceInSidebar, projectId, store, workspaceId]);

	return {
		localWorkspaceState,
		store,
	};
}
