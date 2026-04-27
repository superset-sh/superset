import { getActiveIdAfterRemoval } from "@superset/panes";
import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { getFlattenedV2WorkspaceIds } from "../../utils/getFlattenedV2WorkspaceIds";

/**
 * If the user is viewing the workspace about to be removed, jump to the
 * next visible sidebar sibling (or home). No-op otherwise. Called
 * directly at the callsite — not via a callback prop — because
 * plumbing this through dialog onDeleting was silently dropping the nav.
 */
export function useNavigateAwayFromWorkspace() {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const collections = useCollections();

	return (workspaceId: string) => {
		const isViewingWorkspace = !!matchRoute({
			to: "/v2-workspace/$workspaceId",
			params: { workspaceId },
			fuzzy: true,
		});
		if (!isViewingWorkspace) return;
		const ids = getFlattenedV2WorkspaceIds(collections);
		const next = getActiveIdAfterRemoval(ids, workspaceId, workspaceId);
		if (next) {
			void navigateToV2Workspace(next, navigate);
		} else {
			void navigate({ to: "/" });
		}
	};
}
