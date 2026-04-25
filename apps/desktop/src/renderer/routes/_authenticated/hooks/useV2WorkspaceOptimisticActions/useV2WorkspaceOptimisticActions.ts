import { useMemo } from "react";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useOptimisticCollectionMutation } from "../useOptimisticCollectionMutation";

interface V2WorkspacePatch {
	name?: string;
	branch?: string;
	hostId?: string;
}

export function useV2WorkspaceOptimisticActions() {
	const collections = useCollections();
	const runMutation = useOptimisticCollectionMutation(
		"useV2WorkspaceOptimisticActions",
	);

	return useMemo(
		() => ({
			updateWorkspace: (workspaceId: string, patch: V2WorkspacePatch) =>
				runMutation("Failed to update workspace", () =>
					collections.v2Workspaces.update(workspaceId, (draft) => {
						if (patch.name !== undefined) {
							draft.name = patch.name;
						}
						if (patch.branch !== undefined) {
							draft.branch = patch.branch;
						}
						if (patch.hostId !== undefined) {
							draft.hostId = patch.hostId;
						}
					}),
				),
			renameWorkspace: (workspaceId: string, name: string) =>
				runMutation("Failed to rename workspace", () =>
					collections.v2Workspaces.update(workspaceId, (draft) => {
						draft.name = name;
					}),
				),
		}),
		[collections, runMutation],
	);
}
