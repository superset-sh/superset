import {
	createWorkspaceStore,
	type Pane,
	type WorkspaceState,
} from "@superset/panes";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useEffect, useMemo, useRef, useState } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { PaneViewerData, TerminalPaneData } from "../../types";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

interface LegacyTerminalPaneData {
	sessionKey?: string;
	cwd?: string;
	launchMode?: string;
	command?: string;
	terminalId?: string;
}

/**
 * Migrate legacy terminal pane data to the new {terminalId} shape.
 * Old panes had {sessionKey, cwd, launchMode, command?} — convert them
 * in-place so the renderer always sees {terminalId}.
 * Returns true if any pane was migrated (caller should persist).
 */
function migrateTerminalPaneData(
	state: WorkspaceState<PaneViewerData>,
): boolean {
	let migrated = false;
	for (const tab of state.tabs) {
		for (const pane of Object.values(tab.panes)) {
			if (pane.kind !== "terminal") continue;
			const data = pane.data as unknown as LegacyTerminalPaneData;
			if (data.terminalId) continue;
			// Legacy pane — assign a new terminalId
			(pane as Pane<PaneViewerData>).data = {
				terminalId: crypto.randomUUID(),
			} as TerminalPaneData as PaneViewerData;
			migrated = true;
		}
	}
	return migrated;
}

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
	const persistedPaneLayout = useMemo(() => {
		const layout =
			(localWorkspaceState?.paneLayout as
				| WorkspaceState<PaneViewerData>
				| undefined) ?? EMPTY_STATE;

		// Migrate legacy terminal panes ({sessionKey, cwd, …} → {terminalId})
		if (layout !== EMPTY_STATE && migrateTerminalPaneData(layout)) {
			// Persist the migrated layout back so the migration only runs once
			if (collections.v2WorkspaceLocalState.get(workspaceId)) {
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					draft.paneLayout = layout;
				});
			}
		}

		return layout;
	}, [localWorkspaceState, collections, workspaceId]);

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

	return {
		localWorkspaceState,
		store,
	};
}
