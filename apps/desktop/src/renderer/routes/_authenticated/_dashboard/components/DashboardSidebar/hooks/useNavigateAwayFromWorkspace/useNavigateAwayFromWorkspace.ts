import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDeletingWorkspaces } from "renderer/routes/_authenticated/providers/DeletingWorkspacesProvider";
import { getFlattenedV2WorkspaceIds } from "../../utils/getFlattenedV2WorkspaceIds";
import { resolveWorkspaceRemovalNavigationTarget } from "./navigationTarget";

function reportRemovalNavigationError(error: unknown) {
	console.error("[useNavigateAwayFromWorkspace] navigation failed", error);
}

/**
 * If the user is viewing the workspace about to be removed, navigate to a
 * valid next visible workspace sibling (or home). No-ops when the active
 * route is a different workspace, so callers can fire this up-front without
 * hijacking the user if they've already moved on.
 */
export function useNavigateAwayFromWorkspace() {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const collections = useCollections();
	const { isDeleting } = useDeletingWorkspaces();

	const navigateAwayFromWorkspace = useCallback(
		(workspaceId: string) => {
			const workspaceMatch = matchRoute({
				to: "/v2-workspace/$workspaceId",
				fuzzy: true,
			});
			const activeWorkspaceId =
				workspaceMatch !== false ? workspaceMatch.workspaceId : null;
			const target = resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId,
				removedWorkspaceId: workspaceId,
				orderedWorkspaceIds: getFlattenedV2WorkspaceIds(collections),
				isWorkspaceValid: (id) =>
					collections.v2Workspaces.get(id) !== undefined,
				isWorkspaceDeleting: (id) => isDeleting(id),
			});

			if (!target) return;
			if (target.kind === "workspace") {
				void navigateToV2Workspace(target.workspaceId, navigate, {
					replace: true,
				}).catch(reportRemovalNavigationError);
				return;
			}
			void navigate({ to: "/", replace: true }).catch(
				reportRemovalNavigationError,
			);
		},
		[collections, isDeleting, matchRoute, navigate],
	);

	return { navigateAwayFromWorkspace };
}
