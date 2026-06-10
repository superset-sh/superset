import type { SelectV2Project, SelectV2Workspace } from "@superset/db/schema";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useCollections } from "renderer/routes/_authenticated/providers/CollectionsProvider";
import { hostProjectListQueryKey } from "../useHostProjectIds";

export interface ProjectSetupResult {
	projectId: string;
	repoPath: string;
	mainWorkspaceId: string | null;
	project?: SelectV2Project;
	mainWorkspace?: SelectV2Workspace | null;
}

/**
 * Side effects to apply after a project is created or set up on a host:
 * make sure it shows up in the sidebar, and invalidate the cached host
 * project list so callers re-evaluate `needsSetup`.
 */
export function useFinalizeProjectSetup() {
	const { ensureProjectInSidebar, ensureWorkspaceInSidebar } =
		useDashboardSidebarState();
	const queryClient = useQueryClient();
	const collections = useCollections();

	return useCallback(
		(hostUrl: string, result: ProjectSetupResult) => {
			if (result.project) {
				collections.v2Projects.startSyncImmediate();
				if (!collections.v2Projects.utils.upsertSyncedRow(result.project)) {
					console.warn(
						"[projects] Project setup could not hydrate the project row immediately",
						result.project.id,
					);
				}
			}
			if (result.mainWorkspace) {
				collections.v2Workspaces.startSyncImmediate();
				if (
					!collections.v2Workspaces.utils.upsertSyncedRow(result.mainWorkspace)
				) {
					console.warn(
						"[projects] Project setup could not hydrate the main workspace row immediately",
						result.mainWorkspace.id,
					);
				}
			}

			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, result.projectId);
			} else {
				ensureProjectInSidebar(result.projectId);
			}
			void queryClient.invalidateQueries({
				queryKey: hostProjectListQueryKey(hostUrl),
			});
		},
		[
			collections,
			ensureProjectInSidebar,
			ensureWorkspaceInSidebar,
			queryClient,
		],
	);
}
