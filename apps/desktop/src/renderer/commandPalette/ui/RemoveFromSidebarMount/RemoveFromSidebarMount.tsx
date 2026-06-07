import { useEffect } from "react";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useDashboardSidebarState } from "renderer/routes/_authenticated/hooks/useDashboardSidebarState";
import { useRemoveFromSidebarIntent } from "renderer/stores/remove-workspace-from-sidebar-intent";

/**
 * Headless effect that unpins a workspace from the sidebar as soon as a
 * removal is requested. Unpinning is reversible — the workspace itself is not
 * deleted and can be re-pinned from the Workspaces page or sidebar — so it runs
 * immediately with no confirmation dialog. Lives here (rather than at each call
 * site) because callers like the command palette fire imperatively and can't
 * use the router/collections hooks the removal needs.
 */
export function RemoveFromSidebarMount() {
	const target = useRemoveFromSidebarIntent((s) => s.target);
	const clear = useRemoveFromSidebarIntent((s) => s.clear);
	const { hideWorkspaceInSidebar, removeWorkspaceFromSidebar } =
		useDashboardSidebarState();
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();

	useEffect(() => {
		if (!target) return;
		// One-shot consumer. No cleanup/cancel guard is needed: the body is fully
		// synchronous (no awaited continuation that could land after unmount) and
		// the collection writes are idempotent. clear() resets the intent so each
		// request is handled exactly once.
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
