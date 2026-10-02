import { useShowsAppTopBar } from "renderer/routes/_authenticated/_dashboard/hooks/useShowsAppTopBar";
import { useWorkspaceSidebarStore } from "renderer/stores/workspace-sidebar-state";

/** True while the sidebar is a rail: every header in the window's top row joins one band. */
export function useCollapsedSidebarBand(): boolean {
	const showsAppTopBar = useShowsAppTopBar();
	const isSidebarCollapsed = useWorkspaceSidebarStore((s) => s.isCollapsed());
	return !showsAppTopBar && isSidebarCollapsed;
}
