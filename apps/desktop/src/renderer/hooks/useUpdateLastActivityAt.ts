import { useCallback } from "react";
import { electronTrpc } from "renderer/lib/electron-trpc";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";

export function useUpdateLastActivityAt() {
	const collections = useCollections();
	const utils = electronTrpc.useUtils();
	const mutation = electronTrpc.workspaces.updateLastActivityAt.useMutation({
		onSuccess: () => utils.workspaces.getAllGrouped.invalidate(),
	});

	return useCallback(
		(workspaceId: string) => {
			if (collections.v2WorkspaceLocalState.get(workspaceId)) {
				collections.v2WorkspaceLocalState.update(workspaceId, (draft) => {
					draft.lastActivityAt = new Date();
				});
			}
			mutation.mutate({ workspaceId });
		},
		[collections, mutation.mutate],
	);
}
