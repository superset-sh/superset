import { useMatchRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useArchiveWorkspace } from "renderer/hooks/host-service/useArchiveWorkspace";
import { archiveWorkspaceWithUndo } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarWorkspaceItem/hooks/useDashboardSidebarWorkspaceItemActions/useDashboardSidebarWorkspaceItemActions";
import { useNavigateAwayFromWorkspace } from "renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/hooks/useNavigateAwayFromWorkspace";
import { useArchiveWorkspaceIntent } from "renderer/stores/archive-workspace-intent";

/**
 * Headless consumer of the "Archive workspace" intent, so the command palette
 * can run the same archive-with-undo flow as the sidebar row's archive icon —
 * the palette fires imperatively and can't use the router/host hooks itself.
 */
export function ArchiveWorkspaceMount() {
	const target = useArchiveWorkspaceIntent((s) => s.target);
	const clear = useArchiveWorkspaceIntent((s) => s.clear);
	const navigate = useNavigate();
	const matchRoute = useMatchRoute();
	// Empty id until a request lands: the hook resolves to an unready host and
	// its callbacks are never invoked before `target` exists.
	const { archive, restore } = useArchiveWorkspace(
		target?.workspaceId ?? "",
		target?.hostId,
	);
	const { navigateAwayFromWorkspace } = useNavigateAwayFromWorkspace();
	const archiveInFlight = useRef(new Set<string>());

	useEffect(() => {
		if (!target) return;
		const { workspaceId, workspaceName } = target;
		// One-shot consumer: clear up front so a repeat request re-fires, and
		// let the archive flow run on the callbacks captured here.
		clear();
		if (archiveInFlight.current.has(workspaceId)) return;
		archiveInFlight.current.add(workspaceId);
		void (async () => {
			try {
				await archiveWorkspaceWithUndo({
					workspaceId,
					workspaceName,
					isActive: !!matchRoute({
						to: "/v2-workspace/$workspaceId",
						params: { workspaceId },
						fuzzy: true,
					}),
					archive,
					restore,
					navigateAway: () => navigateAwayFromWorkspace(workspaceId),
					navigateBack: () =>
						navigate({
							to: "/v2-workspace/$workspaceId",
							params: { workspaceId },
						}),
					// The palette owns focus restoration when it closes, so there is no
					// sidebar row to hand focus back to here.
					focusSidebarList: () => {},
				});
			} finally {
				archiveInFlight.current.delete(workspaceId);
			}
		})();
	}, [
		target,
		clear,
		matchRoute,
		navigate,
		navigateAwayFromWorkspace,
		archive,
		restore,
	]);

	return null;
}
