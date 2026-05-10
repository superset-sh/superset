import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useDeletingWorkspaces } from "renderer/routes/_authenticated/providers/DeletingWorkspacesProvider";
import { getFlattenedV2WorkspaceIds } from "../../utils/getFlattenedV2WorkspaceIds";
import {
	resolveWorkspaceRemovalNavigationTarget,
	type WorkspaceRemovalNavigationTarget,
} from "./navigationTarget";

function reportRemovalNavigationError(error: unknown) {
	console.error("[useNavigateAwayFromWorkspace] navigation failed", error);
}

/**
 * If the user is viewing the workspace about to be removed, resolve a
 * valid next visible workspace sibling (or home). Destructive deletes use
 * the resolver after `workspaceCleanup.destroy` succeeds; non-destructive
 * sidebar removals can navigate immediately.
 */
export function useNavigateAwayFromWorkspace() {
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	const collections = useCollections();
	const { isDeleting } = useDeletingWorkspaces();

	const getNavigationTargetAfterRemoval = useCallback(
		(workspaceId: string): WorkspaceRemovalNavigationTarget | null => {
			const workspaceMatch = matchRoute({
				to: "/v2-workspace/$workspaceId",
				fuzzy: true,
			});
			const activeWorkspaceId =
				workspaceMatch !== false ? workspaceMatch.workspaceId : null;
			const orderedWorkspaceIds = getFlattenedV2WorkspaceIds(collections);

			return resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId,
				removedWorkspaceId: workspaceId,
				orderedWorkspaceIds,
				isWorkspaceValid: (id) =>
					collections.v2Workspaces.get(id) !== undefined,
				isWorkspaceDeleting: (id) => isDeleting(id),
			});
		},
		[collections, isDeleting, matchRoute],
	);

	const navigateToRemovalTarget = useCallback(
		(target: WorkspaceRemovalNavigationTarget | null) => {
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
		[navigate],
	);

	const navigateAwayFromWorkspace = useCallback(
		(workspaceId: string) => {
			navigateToRemovalTarget(getNavigationTargetAfterRemoval(workspaceId));
		},
		[getNavigationTargetAfterRemoval, navigateToRemovalTarget],
	);

	return {
		getNavigationTargetAfterRemoval,
		navigateAwayFromWorkspace,
		navigateToRemovalTarget,
	};
}
