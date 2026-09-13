import { eq, useLiveQuery } from "@tanstack/react-db";
import { useCallback } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useRowlessAgentTreeStore } from "renderer/stores/sidebar-agent-tree";

/**
 * The "Show tree in sidebar" switch for one workspace: its local-state row,
 * else the session fallback a rowless workspace wrote. Subscribe only where
 * a tree can show, since every subscriber is a live query on the row.
 */
export function useSidebarAgentTreeShown(
	workspaceId: string,
): [shown: boolean, setShown: (shown: boolean) => void] {
	const collections = useCollections();
	const { data: [localState] = [] } = useLiveQuery(
		(query) =>
			query
				.from({ localState: collections.v2WorkspaceLocalState })
				.where(({ localState }) => eq(localState.workspaceId, workspaceId)),
		[collections, workspaceId],
	);
	const row = localState?.workspaceId === workspaceId ? localState : undefined;
	const rowlessShown = useRowlessAgentTreeStore(
		(state) => state.shown[workspaceId],
	);
	const setRowlessShown = useRowlessAgentTreeStore((state) => state.setShown);

	const setShown = useCallback(
		(shown: boolean) => {
			if (!collections.v2WorkspaceLocalState.get(workspaceId)) {
				setRowlessShown(workspaceId, shown);
				return;
			}
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				draft.sidebarState.agentTreeShown = shown;
			});
		},
		[collections, setRowlessShown, workspaceId],
	);

	return [
		row ? row.sidebarState.agentTreeShown : (rowlessShown ?? false),
		setShown,
	];
}
