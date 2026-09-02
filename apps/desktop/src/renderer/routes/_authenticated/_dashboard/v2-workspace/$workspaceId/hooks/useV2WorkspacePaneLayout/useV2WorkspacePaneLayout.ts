import { createWorkspaceStore, type WorkspaceState } from "@superset/panes";
import { FEATURE_FLAGS } from "@superset/shared/constants";
import { eq } from "@tanstack/db";
import { useLiveQuery } from "@tanstack/react-db";
import { useFeatureFlagEnabled } from "posthog-js/react";
import { useEffect, useMemo, useRef } from "react";
import { useWorkspace } from "renderer/routes/_authenticated/_dashboard/v2-workspace/providers/WorkspaceProvider";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import {
	applyRememberedV2PaneSelection,
	rememberV2PaneSelection,
} from "renderer/stores/v2-pane-selection";
import type { PaneViewerData } from "../../types";
import { dropUnavailablePanes } from "./utils/dropUnavailablePanes";
import {
	getSharedPaneLayoutSnapshot,
	preserveLocalPaneSelection,
} from "./utils/preserveLocalPaneSelection";

const EMPTY_STATE: WorkspaceState<PaneViewerData> = {
	version: 1,
	tabs: [],
	activeTabId: null,
};

function getSnapshot(state: WorkspaceState<PaneViewerData>): string {
	return getSharedPaneLayoutSnapshot(state);
}

export function useV2WorkspacePaneLayout() {
	const { workspace } = useWorkspace();
	const workspaceId = workspace.id;
	const collections = useCollections();
	// Keep the volatile pane store scoped to the route workspace. During fast
	// workspace switches, live queries can briefly return stale rows; sharing
	// the same store across that boundary lets panes from one worktree render
	// and persist under another.
	//
	// Seed the store synchronously from the collection row (keyed by this
	// workspace's id, so it can't serve a stale neighbor) instead of starting
	// empty: an empty initial state blanks the whole tab bar for the first
	// paint after every workspace switch, flashing its contents in one
	// effect-cycle late.
	const workspaceRuntime = useMemo(() => {
		const persistedLayout =
			(collections.v2WorkspaceLocalState.get(workspaceId)?.paneLayout as
				| WorkspaceState<PaneViewerData>
				| undefined) ?? EMPTY_STATE;
		const seededLayout = applyRememberedV2PaneSelection(
			workspaceId,
			persistedLayout,
		);
		return {
			workspaceId,
			seededSnapshot: getSnapshot(seededLayout),
			store: createWorkspaceStore<PaneViewerData>({
				initialState: seededLayout,
			}),
		};
	}, [collections, workspaceId]);
	const { store } = workspaceRuntime;
	const syncStateRef = useRef({
		workspaceId,
		lastSyncedSnapshot: workspaceRuntime.seededSnapshot,
	});

	const { data: localWorkspaceRows = [], isReady: isLayoutReady } =
		useLiveQuery(
			(query) =>
				query
					.from({ v2WorkspaceLocalState: collections.v2WorkspaceLocalState })
					.where(({ v2WorkspaceLocalState }) =>
						eq(v2WorkspaceLocalState.workspaceId, workspaceId),
					),
			[collections, workspaceId],
		);
	const localWorkspaceState =
		localWorkspaceRows.find((row) => row.workspaceId === workspaceId) ?? null;
	const isPagesEnabled = useFeatureFlagEnabled(FEATURE_FLAGS.PAGES);
	const unavailableKinds = useMemo(
		() => (isPagesEnabled === false ? ["page"] : []),
		[isPagesEnabled],
	);

	const persistedPaneLayout = useMemo(
		() =>
			dropUnavailablePanes(
				localWorkspaceState?.workspaceId === workspaceId
					? ((localWorkspaceState.paneLayout as
							| WorkspaceState<PaneViewerData>
							| undefined) ?? EMPTY_STATE)
					: EMPTY_STATE,
				unavailableKinds,
			),
		[localWorkspaceState, workspaceId, unavailableKinds],
	);

	useEffect(() => {
		syncStateRef.current = {
			workspaceId: workspaceRuntime.workspaceId,
			lastSyncedSnapshot: workspaceRuntime.seededSnapshot,
		};
	}, [workspaceRuntime]);

	useEffect(() => {
		// Wait for the live query to settle for the current workspace before
		// syncing: right after a switch it can still be resolving, in which
		// case `persistedPaneLayout` falls back to EMPTY_STATE — applying that
		// would blank the store that was just seeded synchronously above,
		// reintroducing the flash this seeding was meant to fix.
		if (!isLayoutReady) return;

		const nextSnapshot = getSnapshot(persistedPaneLayout);
		if (nextSnapshot === syncStateRef.current.lastSyncedSnapshot) {
			return;
		}

		syncStateRef.current.lastSyncedSnapshot = nextSnapshot;
		store
			.getState()
			.replaceState((current) =>
				preserveLocalPaneSelection(current, persistedPaneLayout),
			);
	}, [persistedPaneLayout, store, isLayoutReady]);

	useEffect(() => {
		const unsubscribe = store.subscribe((nextStore) => {
			const nextWorkspaceState: WorkspaceState<PaneViewerData> = {
				version: nextStore.version,
				tabs: nextStore.tabs,
				activeTabId: nextStore.activeTabId,
			};
			rememberV2PaneSelection(workspaceId, nextWorkspaceState);
			const nextSnapshot = getSnapshot(nextWorkspaceState);
			if (nextSnapshot === syncStateRef.current.lastSyncedSnapshot) {
				return;
			}

			if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
				return;
			}

			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.paneLayout = nextWorkspaceState;
			});
			syncStateRef.current.lastSyncedSnapshot = nextSnapshot;
		});

		return () => {
			unsubscribe();
		};
	}, [collections, store, workspaceId]);

	return { store, isLayoutReady };
}
