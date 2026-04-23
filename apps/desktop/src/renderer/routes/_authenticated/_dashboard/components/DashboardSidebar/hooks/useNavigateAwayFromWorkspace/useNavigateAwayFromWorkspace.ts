import { useNavigate, useParams } from "@tanstack/react-router";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { getFlattenedV2WorkspaceIds } from "../../utils/getFlattenedV2WorkspaceIds";

/**
 * Returns a function that, given a workspaceId about to disappear from
 * the sidebar (delete or hide), navigates the user off it to the next
 * visible sibling — or home if none remain. No-op if the user isn't
 * currently viewing the workspace being removed.
 */
export function useNavigateAwayFromWorkspace() {
	const navigate = useNavigate();
	const params = useParams({ strict: false });
	const collections = useCollections();

	return (workspaceId: string) => {
		if (params.workspaceId !== workspaceId) return;
		const ids = getFlattenedV2WorkspaceIds(collections);
		const next = ids.find((id) => id !== workspaceId);
		if (next) {
			void navigateToV2Workspace(next, navigate);
		} else {
			void navigate({ to: "/" });
		}
	};
}
