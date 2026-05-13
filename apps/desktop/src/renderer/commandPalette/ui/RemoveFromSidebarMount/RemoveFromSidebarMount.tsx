import { useEffect, useRef } from "react";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useRemoveFromSidebarIntent } from "renderer/stores/remove-workspace-from-sidebar-intent";

export function RemoveFromSidebarMount() {
	const target = useRemoveFromSidebarIntent((s) => s.target);
	const clear = useRemoveFromSidebarIntent((s) => s.clear);
	const { hideWorkspaceInSidebar, removeWorkspaceFromSidebar } =
		useDashboardSidebarState();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();
	const lastTickRef = useRef(0);

	useEffect(() => {
		if (!target || target.tick === lastTickRef.current) return;
		lastTickRef.current = target.tick;
		navigateAwayFromWorkspace(target.workspaceId);
		if (target.isMain) {
			hideWorkspaceInSidebar(target.workspaceId, target.projectId);
		} else {
			removeWorkspaceFromSidebar(target.workspaceId);
		}
		clear();
	}, [
		target,
		navigateAwayFromWorkspace,
		hideWorkspaceInSidebar,
		removeWorkspaceFromSidebar,
		clear,
	]);

	return null;
}
