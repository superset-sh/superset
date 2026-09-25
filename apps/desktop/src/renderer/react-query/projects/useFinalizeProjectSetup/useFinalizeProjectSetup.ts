import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { hostProjectListQueryKey } from "../useHostProjectIds";

export interface ProjectSetupResult {
	projectId: string;
	repoPath: string;
}

/**
 * Side effects to apply after a project is created or set up on a host:
 * make sure it shows up in the sidebar, and invalidate the cached host
 * project list so callers re-evaluate `needsSetup`. A new project has no
 * workspaces yet; the user creates one from the composer.
 */
export function useFinalizeProjectSetup() {
	const { ensureProjectInSidebar } = useDashboardSidebarState();
	const queryClient = useQueryClient();

	return useCallback(
		(hostUrl: string, result: ProjectSetupResult) => {
			ensureProjectInSidebar(result.projectId);
			void queryClient.invalidateQueries({
				queryKey: hostProjectListQueryKey(hostUrl),
			});
		},
		[ensureProjectInSidebar, queryClient],
	);
}
