import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { hostProjectListQueryKey } from "../useHostProjectIds";

export interface ProjectSetupResult {
	projectId: string;
	repoPath: string;
	mainWorkspaceId: string | null;
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

	return useCallback(
		(hostUrl: string, result: ProjectSetupResult) => {
			if (result.mainWorkspaceId) {
				ensureWorkspaceInSidebar(result.mainWorkspaceId, result.projectId);
			} else {
				ensureProjectInSidebar(result.projectId);
			}
			void queryClient.invalidateQueries({
				queryKey: hostProjectListQueryKey(hostUrl),
			});
		},
		[ensureProjectInSidebar, ensureWorkspaceInSidebar, queryClient],
	);
}
