import type { WorkspaceStore } from "@superset/panes";
import { useCallback, useEffect, useState } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import type { StoreApi } from "zustand/vanilla";
import type { PaneViewerData } from "../../types";
import { expandPaneArea, restorePaneArea } from "../../utils/expandPaneArea";

export function useRightPaneAreaExpansion({
	workspaceId,
	centerStore,
	rightStore,
	isOpen,
	isReady,
}: {
	workspaceId: string;
	centerStore: StoreApi<WorkspaceStore<PaneViewerData>>;
	rightStore: StoreApi<WorkspaceStore<PaneViewerData>>;
	isOpen: boolean;
	isReady: boolean;
}) {
	const collections = useCollections();
	const [expandedWorkspaceId, setExpandedWorkspaceId] = useState<string | null>(
		null,
	);
	const isExpanded = expandedWorkspaceId === workspaceId;

	const collapse = useCallback(() => {
		const snapshot =
			collections.v2WorkspaceLocalState.get(
				workspaceId,
			)?.rightPaneAreaExpansion;
		if (snapshot) {
			restorePaneArea({ center: centerStore, right: rightStore, snapshot });
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				delete draft.rightPaneAreaExpansion;
			});
		}
		setExpandedWorkspaceId(null);
	}, [collections, workspaceId, centerStore, rightStore]);

	const expand = useCallback(() => {
		const row = collections.v2WorkspaceLocalState.get(workspaceId);
		if (!row || row.rightPaneAreaExpansion) return;
		const snapshot = expandPaneArea({ center: centerStore, right: rightStore });
		collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
			draft.rightPaneAreaExpansion = snapshot;
		});
		setExpandedWorkspaceId(workspaceId);
	}, [collections, workspaceId, centerStore, rightStore]);

	const discardSnapshot = useCallback(() => {
		if (
			collections.v2WorkspaceLocalState.get(workspaceId)?.rightPaneAreaExpansion
		) {
			collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
				delete draft.rightPaneAreaExpansion;
			});
		}
		setExpandedWorkspaceId(null);
	}, [collections, workspaceId]);

	useEffect(() => {
		if (!isReady || isExpanded) return;
		collapse();
	}, [isReady, isExpanded, collapse]);

	useEffect(() => {
		if (!isOpen && isExpanded) collapse();
	}, [isOpen, isExpanded, collapse]);

	return {
		isExpanded,
		toggleExpanded: isExpanded ? collapse : expand,
		discardSnapshot,
	};
}
