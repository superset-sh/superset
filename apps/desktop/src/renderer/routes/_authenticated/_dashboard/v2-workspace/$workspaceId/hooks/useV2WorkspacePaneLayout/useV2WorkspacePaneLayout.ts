import { useEffect, useState } from "react";
import { getOrCreateWorkspacePaneStore } from "renderer/lib/workspace-pane-registry";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";

interface UseV2WorkspacePaneLayoutParams {
	projectId: string;
	workspaceId: string;
}

export function useV2WorkspacePaneLayout({
	projectId,
	workspaceId,
}: UseV2WorkspacePaneLayoutParams) {
	const { ensureWorkspaceInSidebar } = useDashboardSidebarState();
	// Pull from the registry — same instance the create flow / addLaunchPanes
	// write to. Persistence wiring lives in the registry; this hook just
	// surfaces the store to the route and keeps the sidebar entry alive.
	const [store] = useState(() => getOrCreateWorkspacePaneStore(workspaceId));

	useEffect(() => {
		ensureWorkspaceInSidebar(workspaceId, projectId);
	}, [ensureWorkspaceInSidebar, projectId, workspaceId]);

	return { store };
}
