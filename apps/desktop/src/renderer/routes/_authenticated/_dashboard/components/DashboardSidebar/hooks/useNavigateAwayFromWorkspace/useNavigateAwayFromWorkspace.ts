import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";
import { useActiveOrganizationId } from "renderer/hooks/useActiveOrganizationId";
import { useCloudWorkspaces } from "renderer/hooks/useCloudWorkspaces";
import { authClient } from "renderer/lib/auth-client";
import {
	EMPTY_CLOUD_SIDEBAR,
	useCloudSidebarStore,
} from "renderer/routes/_authenticated/_dashboard/stores/cloudSidebarStore";
import { useDeletingWorkspacesStore } from "renderer/routes/_authenticated/_dashboard/stores/deletingWorkspacesStore";
import { buildCloudSidebar } from "renderer/routes/_authenticated/_dashboard/utils/buildCloudSidebar";
import { navigateToV2Workspace } from "renderer/routes/_authenticated/_dashboard/utils/workspace-navigation";
import { useProjectCollections } from "renderer/routes/_authenticated/hooks/useProjectCollections";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { useHostWorkspaces } from "renderer/routes/_authenticated/providers/HostWorkspacesProvider";
import { useTagFolderContext } from "renderer/routes/_authenticated/utils/workspaceTagFolders";
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
	const projectCollections = useProjectCollections();
	const projectOrder = projectCollections.projectOrder;
	const { workspaces, isReady } = useHostWorkspaces();
	const tagFolderContext = useTagFolderContext();
	const workspaceIds = useMemo(
		() => new Set(workspaces.map((workspace) => workspace.id)),
		[workspaces],
	);
	const organizationId = useActiveOrganizationId();
	const { data: session } = authClient.useSession();
	const userId = session?.user?.id ?? null;
	const { workspaces: cloudWorkspaces } = useCloudWorkspaces();
	const cloudSidebarState = useCloudSidebarStore((state) =>
		organizationId
			? (state.byOrganization[organizationId] ?? EMPTY_CLOUD_SIDEBAR)
			: EMPTY_CLOUD_SIDEBAR,
	);
	const cloudWorkspaceIds = useMemo(() => {
		const layout = buildCloudSidebar({
			workspaces: cloudWorkspaces ?? [],
			state: cloudSidebarState,
			userId,
		});
		return [
			...layout.ungrouped,
			...layout.groups.flatMap((group) => group.workspaces),
		].map((workspace) => workspace.id);
	}, [cloudWorkspaces, cloudSidebarState, userId]);

	const current = useRef({
		collections,
		cloudWorkspaceIds,
		workspaceIds,
		workspaces,
		tagFolderContext,
		projectOrder,
		matchRoute,
		navigate,
		isReady,
	});
	current.current = {
		collections,
		cloudWorkspaceIds,
		workspaceIds,
		workspaces,
		tagFolderContext,
		projectOrder,
		matchRoute,
		navigate,
		isReady,
	};
	const navigateAwayFromWorkspace = useCallback(
		(
			workspaceId: string,
			additionalDeletingWorkspaceIds?: ReadonlySet<string>,
		) => {
			const {
				collections,
				cloudWorkspaceIds,
				workspaceIds,
				workspaces,
				tagFolderContext,
				projectOrder,
				matchRoute,
				navigate,
				isReady,
			} = current.current;
			const workspaceMatch = matchRoute({
				to: "/v2-workspace/$workspaceId",
				fuzzy: true,
			});
			const activeWorkspaceId =
				workspaceMatch !== false ? workspaceMatch.workspaceId : null;
			const cloudIds = new Set(cloudWorkspaceIds);
			const target = resolveWorkspaceRemovalNavigationTarget({
				activeWorkspaceId,
				removedWorkspaceId: workspaceId,
				// The cloud section renders above the sessions and projects.
				orderedWorkspaceIds: [
					...cloudWorkspaceIds,
					...getFlattenedV2WorkspaceIds(
						collections,
						workspaces,
						tagFolderContext,
						projectOrder,
					).filter((id) => !cloudIds.has(id)),
				],
				// Before the host fan-out settles, an unlisted sibling means
				// "unknown", not "gone" — prefer navigating to it over home; the
				// workspace route's own not-found handling covers a true miss.
				isWorkspaceValid: (id) =>
					cloudIds.has(id) || !isReady || workspaceIds.has(id),
				// Rows mid-destroy stay listed until the archive commit lands
				// (after teardown) — exclude every in-flight destroy, not just
				// the caller's own batch. Read at call time for freshness.
				isWorkspaceDeleting: (id) =>
					additionalDeletingWorkspaceIds?.has(id) === true ||
					useDeletingWorkspacesStore.getState().deletingIds.has(id),
			});

			if (!target) return null;
			if (target.kind === "workspace") {
				void navigateToV2Workspace(target.workspaceId, navigate, {
					replace: true,
				}).catch(reportRemovalNavigationError);
				return target;
			}
			// Straight to the v2 empty state — "/" detours through the v1
			// workspace index, which can restore stale pre-migration state
			// (SUPER-1814).
			void navigate({ to: "/new-workspace", replace: true }).catch(
				reportRemovalNavigationError,
			);
			return target;
		},
		[],
	);

	return { navigateAwayFromWorkspace };
}
